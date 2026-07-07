// EditorSession — the persistent, consented browser session (Plane 2).
//
// Model (proven mid-2026 OSS precedent): one-time HEADED login at
// manage.wix.com (human solves reCAPTCHA/2FA), persist storageState, reuse
// across runs. Headed is the conservative default; automation masking via
// --disable-blink-features=AutomationControlled; human-plausible slowMo.
//
// This module is import-safe without a browser installed: playwright is
// imported lazily inside launch(), never at module load.

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { requireConsent } from './consent.js';

export const DEFAULT_STORAGE_STATE = join('.vespasian', 'session', 'state.json');

/** Resolve session options from the environment (all overridable). */
export function resolveSessionOptions(options = {}) {
	const env = options.env ?? process.env;
	return {
		storageStatePath: options.storageStatePath ?? env.WIX_EDITOR_STORAGE_STATE ?? DEFAULT_STORAGE_STATE,
		headless: options.headless ?? env.WIX_EDITOR_HEADLESS === 'true', // headed by default
		slowMo: options.slowMo ?? Number.parseInt(env.WIX_EDITOR_SLOWMO_MS ?? '150', 10),
		baseDir: options.baseDir ?? '.vespasian',
		userDataDir: options.userDataDir ?? join(options.baseDir ?? '.vespasian', 'session', 'profile'),
	};
}

export class EditorSession {
	/** @param {ReturnType<typeof resolveSessionOptions>|object} [options] */
	constructor(options = {}) {
		this.options = resolveSessionOptions(options);
		this.context = null;
		this.browserType = options.browserType ?? 'chromium';
	}

	get storageStatePath() {
		return this.options.storageStatePath;
	}

	/** Is there a persisted session on disk? (freshness is verified at open) */
	hasPersistedState() {
		return existsSync(this.options.storageStatePath);
	}

	/**
	 * Launch the persistent context. Refuses without consent. When
	 * `interactive` is true this is the `vespasian login --editor` path: the
	 * human completes login (reCAPTCHA/2FA) in the headed window.
	 *
	 * @param {{ interactive?: boolean }} [opts]
	 * @returns {Promise<import('playwright').BrowserContext>}
	 */
	async launch({ interactive = false } = {}) {
		requireConsent({ baseDir: this.options.baseDir });
		if (this.context) return this.context;

		// Lazy import: keeps the whole editor/ tree importable in environments
		// without a browser (CI dry-run, unit tests).
		const playwright = await import('playwright');
		const launcher = playwright[this.browserType];

		mkdirSync(this.options.userDataDir, { recursive: true });
		this.context = await launcher.launchPersistentContext(this.options.userDataDir, {
			headless: interactive ? false : this.options.headless,
			slowMo: this.options.slowMo,
			args: ['--disable-blink-features=AutomationControlled'],
			viewport: { width: 1440, height: 900 },
		});
		return this.context;
	}

	/** Persist the current storageState (cookies + origins) for reuse. */
	async saveStorageState() {
		if (!this.context) throw new Error('EditorSession.saveStorageState: no live context');
		mkdirSync(dirname(this.options.storageStatePath), { recursive: true });
		await this.context.storageState({ path: this.options.storageStatePath });
		return this.options.storageStatePath;
	}

	/** A page to drive (first existing or a new one). */
	async page() {
		const context = await this.launch();
		const pages = context.pages();
		return pages.length > 0 ? pages[0] : context.newPage();
	}

	async close() {
		if (this.context) {
			await this.context.close();
			this.context = null;
		}
	}
}
