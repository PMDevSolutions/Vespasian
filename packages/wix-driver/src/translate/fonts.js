// Font families → builtin match or upload plan.
//
// Wix ships ~200+ built-in families (broad Google Fonts coverage); matching is
// against the bundled best-effort subset in wix-builtin-fonts.json. Misses get
// an uploadPlan for the editor's Upload Fonts dialog (no font-upload API;
// WOFF2 preferred, < 4 MB). All matching is explicitly best-effort.

import { readFileSync } from 'node:fs';

import { note } from './schemas.js';

export const FONT_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

// CSS generic/system keywords are not uploadable font files — no .woff2 exists
// for "system-ui". Stacks led by one of these resolve to whatever the visitor's
// OS provides, so they get a 'system' match instead of an upload plan.
const GENERIC_FAMILIES = new Set([
	'system-ui',
	'-apple-system',
	'ui-sans-serif',
	'ui-serif',
	'ui-monospace',
	'ui-rounded',
	'sans-serif',
	'serif',
	'monospace',
	'cursive',
	'fantasy',
]);

const BUILTIN_URL = new URL('./wix-builtin-fonts.json', import.meta.url);

let builtinCache;
export function loadBuiltinFonts() {
	if (!builtinCache) {
		builtinCache = JSON.parse(readFileSync(BUILTIN_URL, 'utf8'));
	}
	return builtinCache;
}

/** First concrete family out of a CSS font-family stack. */
export function primaryFamily(fontFamily) {
	const first = String(fontFamily).split(',')[0] ?? '';
	return first.replace(/^["'\s]+|["'\s]+$/g, '');
}

function slugifyFamily(family) {
	return family
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/**
 * @param {Array<{ slug: string, name?: string, fontFamily: string }>} fontFamilies
 * @returns {{ fonts: Array<{ slug: string, family: string, stack: string,
 *             match: { type: 'builtin', name: string, bestEffort: true }
 *                  | { type: 'system', bestEffort: true }
 *                  | { type: 'upload', plan: object, bestEffort: true } }>,
 *             fidelity: import('./schemas.js').FidelityNote[] }}
 */
export function translateFonts(fontFamilies) {
	const fidelity = [];
	const builtins = loadBuiltinFonts().families;
	const byLower = new Map(builtins.map((f) => [f.toLowerCase(), f]));

	const fonts = fontFamilies.map((entry) => {
		const family = primaryFamily(entry.fontFamily);
		const builtin = byLower.get(family.toLowerCase());
		if (builtin) {
			return {
				slug: entry.slug,
				family: builtin,
				stack: entry.fontFamily,
				match: { type: 'builtin', name: builtin, bestEffort: true },
			};
		}
		if (GENERIC_FAMILIES.has(family.toLowerCase())) {
			// Placeholder/base stacks (system-ui, ui-monospace, …) — nothing to
			// upload, nothing lost: the stack renders from OS fonts as designed.
			return {
				slug: entry.slug,
				family,
				stack: entry.fontFamily,
				match: { type: 'system', bestEffort: true },
			};
		}
		const fileHint = `${slugifyFamily(family)}.woff2`;
		fidelity.push(
			note(
				'fonts.upload-required',
				'warn',
				`Font family "${family}" not matched against the bundled Wix built-in list (best-effort) — an upload plan was generated. ` +
					`Upload ${fileHint} (< 4 MB) via the editor's Upload Fonts dialog; exact versions/subsets and variable-font axes are lost.`,
				{ slug: entry.slug, family },
			),
		);
		return {
			slug: entry.slug,
			family,
			stack: entry.fontFamily,
			match: {
				type: 'upload',
				bestEffort: true,
				plan: {
					fileHints: [fileHint, `${slugifyFamily(family)}.woff`],
					preferredFormat: 'woff2',
					maxBytes: FONT_UPLOAD_MAX_BYTES,
					dialog: 'editor Upload Fonts (no API)',
				},
			},
		};
	});

	return { fonts, fidelity };
}
