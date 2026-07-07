// Flow: open a site's editor in the authenticated session.
//
// The editor URL always comes from the Editor URLs API (never templated), and
// the caller must already have asserted editorType == WIX_STUDIO.

import { tryStep } from '../escalation.js';
import { EDITOR_BOOT_TIMEOUT_MS } from './shared.js';

/**
 * @param {import('../session.js').EditorSession} session
 * @param {{ editorUrl: string, probe?: boolean, baseDir?: string, editorType?: string }} input
 * @returns {Promise<import('playwright').Page | import('../escalation.js').EscalationRequest>}
 */
export async function openEditor(session, { editorUrl, probe = false, baseDir, editorType }) {
	if (!editorUrl) {
		return {
			escalation: true,
			flow: 'openEditor',
			step: 'resolve-url',
			hint: 'No editorUrl provided — resolve it via editorUrls.getEditorUrls() first.',
		};
	}

	const page = await session.page();
	const result = await tryStep(
		{
			flow: 'openEditor',
			step: 'navigate',
			hint: `Open ${editorUrl} manually and check the session is still signed in (session expiry is a designed pause — re-run \`vespasian login --editor\`).`,
			page,
			screenshotDir: `${baseDir ?? '.vespasian'}/screenshots`,
		},
		async () => {
			await page.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: EDITOR_BOOT_TIMEOUT_MS });
			// Signed-out sessions bounce to users.wix.com/signin.
			if (/users\.wix\.com|\/signin/i.test(page.url())) {
				throw new Error('Redirected to Wix sign-in — the persisted session has expired.');
			}
			// Give the editor shell time to bootstrap (network settles slowly).
			await page.waitForLoadState('load', { timeout: EDITOR_BOOT_TIMEOUT_MS }).catch(() => {});
			return page;
		},
	);

	if (probe && result === page) {
		const { probeAndCache } = await import('../probe.js');
		await probeAndCache(page, { baseDir, editorType });
	}
	return result;
}
