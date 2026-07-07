// DOM probe — run once per editorType (and again after selector drift).
//
// Wix ships dozens of releases a day and never documents whether the editor
// canvas is iframed, so nothing is assumed: the probe enumerates frames,
// collects [data-hook] attributes (Wix's own test-selector convention) and
// aria landmarks, and caches a versioned selector map under
// .vespasian/selectors/. Flows consult the cache first; when it goes stale
// they escalate instead of guessing.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const SELECTOR_MAP_VERSION = 1;

/** Path of the cached selector map for an editor type. */
export function selectorMapPath({ baseDir = '.vespasian', editorType = 'WIX_STUDIO' } = {}) {
	return join(baseDir, 'selectors', `${editorType.toLowerCase()}-v${SELECTOR_MAP_VERSION}.json`);
}

/** Load a cached selector map, or null. */
export function loadSelectorMap({ baseDir, editorType } = {}) {
	const path = selectorMapPath({ baseDir, editorType });
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		return null;
	}
}

/** Persist a probe result as the selector map cache. */
export function saveSelectorMap(map, { baseDir, editorType } = {}) {
	const path = selectorMapPath({ baseDir, editorType: editorType ?? map.editorType });
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(map, null, '\t')}\n`);
	return path;
}

/**
 * Probe a live editor page: frames, data-hooks, aria landmarks.
 * @param {import('playwright').Page} page
 * @param {{ editorType?: string, maxHooks?: number }} [opts]
 */
export async function probePage(page, { editorType = 'WIX_STUDIO', maxHooks = 500 } = {}) {
	const frames = page.frames().map((frame) => ({
		name: frame.name() || null,
		url: frame.url(),
	}));

	const collect = async (target) =>
		target.evaluate((limit) => {
			const hooks = [];
			for (const el of document.querySelectorAll('[data-hook]')) {
				if (hooks.length >= limit) break;
				hooks.push({
					hook: el.getAttribute('data-hook'),
					tag: el.tagName.toLowerCase(),
					role: el.getAttribute('role'),
					label: el.getAttribute('aria-label'),
				});
			}
			const landmarks = [];
			for (const el of document.querySelectorAll('[role], [aria-label]')) {
				if (landmarks.length >= limit) break;
				const role = el.getAttribute('role');
				const label = el.getAttribute('aria-label');
				if (role || label) landmarks.push({ role, label, tag: el.tagName.toLowerCase() });
			}
			return { hooks, landmarks };
		}, maxHooks);

	const main = await collect(page);
	const frameHooks = [];
	for (const frame of page.frames()) {
		if (frame === page.mainFrame()) continue;
		try {
			const result = await collect(frame);
			frameHooks.push({ frameUrl: frame.url(), ...result });
		} catch {
			frameHooks.push({ frameUrl: frame.url(), error: 'not accessible (cross-origin?)' });
		}
	}

	return {
		version: SELECTOR_MAP_VERSION,
		editorType,
		probedUrl: page.url(),
		frames,
		hooks: main.hooks,
		landmarks: main.landmarks,
		frameHooks,
	};
}

/** Probe and cache in one step. */
export async function probeAndCache(page, opts = {}) {
	const map = await probePage(page, opts);
	const path = saveSelectorMap(map, opts);
	return { map, path };
}
