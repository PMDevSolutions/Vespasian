// Spacing scale → CSS custom properties + utilities.
//
// Wix has NO spacing tokens anywhere (no Site Styles tab, per-element px*
// values only), so the extracted scale survives solely as :root --vsp-space-*
// custom properties plus .vsp-p-*/.vsp-m-* utility classes in global.css
// (Studio-only). That structural loss is always recorded.

import { note } from './schemas.js';

function cssSize(entry) {
	return typeof entry.size === 'number' ? `${entry.size}px` : String(entry.size);
}

/**
 * Documented convention: `--vsp-space-<slug>`. Slugs that already carry a
 * `space` segment (the pipeline's base `space-40` and namespaced `id-space-40`
 * slugs) keep it — `--vsp-space-40`, `--vsp-id-space-40` — never doubled into
 * `--vsp-space-space-40`.
 */
function spaceVarName(slug) {
	return /(^|-)space(-|$)/.test(slug) ? `--vsp-${slug}` : `--vsp-space-${slug}`;
}

/**
 * @param {Array<{ slug: string, size: string|number, name?: string }>} spacingSizes
 * @returns {{ spacing: { vars: Array<{ name: string, value: string }>,
 *             utilities: string[] }, css: string,
 *             fidelity: import('./schemas.js').FidelityNote[] }}
 */
export function translateSpacing(spacingSizes) {
	const fidelity = [];
	if (spacingSizes.length === 0) {
		return { spacing: { vars: [], utilities: [] }, css: '', fidelity };
	}

	const vars = spacingSizes.map((entry) => ({
		name: spaceVarName(entry.slug),
		value: cssSize(entry),
	}));

	const lines = [];
	lines.push(':root {');
	for (const v of vars) lines.push(`\t${v.name}: ${v.value};`);
	lines.push('}');
	lines.push('');

	const utilities = [];
	for (const entry of spacingSizes) {
		const varName = spaceVarName(entry.slug);
		utilities.push(`vsp-p-${entry.slug}`, `vsp-m-${entry.slug}`);
		lines.push(`.vsp-p-${entry.slug} { padding: var(${varName}); }`);
		lines.push(`.vsp-m-${entry.slug} { margin: var(${varName}); }`);
	}

	fidelity.push(
		note(
			'spacing.css-only',
			'info',
			`Wix has no spacing tokens — the ${spacingSizes.length}-step scale lives only in global.css (--vsp-space-*, .vsp-p-*/.vsp-m-* utilities, Studio-only). The site owner sees no editable spacing system in the editor.`,
			{ slugs: spacingSizes.map((s) => s.slug) },
		),
	);

	return { spacing: { vars, utilities }, css: lines.join('\n'), fidelity };
}
