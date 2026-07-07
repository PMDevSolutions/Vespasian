// Type ramp → Wix's fixed 9-slot text theme (H1–H6 + Paragraph 1–3).
//
// Sizes are ranked descending and assigned H1→H6 then P1→P3. Anything beyond
// nine slots spills into .vsp-text-<slug> custom classes in global.css
// (Studio-only; invisible in the editor's typography panel — recorded as a
// fidelity loss).

import { note } from './schemas.js';

export const TEXT_SLOTS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p1', 'p2', 'p3'];

/**
 * Parse a CSS size into px for ranking. Handles numbers, px, rem/em (×16),
 * pt (×4/3) and picks the first numeric inside clamp()/var() soups.
 * @returns {{ px: number, exact: boolean }}
 */
export function sizeToPx(size) {
	if (typeof size === 'number' && Number.isFinite(size)) return { px: size, exact: true };
	const text = String(size).trim();
	const match = /(-?\d*\.?\d+)\s*(px|rem|em|pt)?/i.exec(text);
	if (!match) return { px: 16, exact: false };
	const value = Number.parseFloat(match[1]);
	const unit = (match[2] ?? 'px').toLowerCase();
	const px = unit === 'rem' || unit === 'em' ? value * 16 : unit === 'pt' ? (value * 4) / 3 : value;
	// clamp()/calc() expressions rank by their first term only — flag as inexact.
	const exact = !/clamp|calc|min\(|max\(/i.test(text);
	return { px, exact };
}

function cssSize(entry) {
	return typeof entry.size === 'number' ? `${entry.size}px` : String(entry.size);
}

/** Locale-independent codepoint comparator — plan output must be byte-identical across machines. */
function compareSlugs(a, b) {
	return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Cluster font sizes into the 9-slot text theme.
 *
 * @param {Array<{ slug: string, size: string|number, name?: string }>} fontSizes
 * @param {Array<{ slug: string, family: string, match: object }>} [fonts]  Output of fonts.js (for slot family hints).
 * @param {Object} [options]
 * @param {Set<string>} [options.preferredSlugs]  Font slugs derived from the
 *   source document (tokens.json provenance). These win the theme slots; base
 *   placeholder stacks apply only when the document contributed no family.
 * @returns {{ typography: { slots: Record<string, object>, overflow: Array<object> },
 *             fidelity: import('./schemas.js').FidelityNote[] }}
 */
export function translateTypography(fontSizes, fonts = [], { preferredSlugs } = {}) {
	const fidelity = [];

	const ranked = fontSizes
		.map((entry) => {
			const { px, exact } = sizeToPx(entry.size);
			if (!exact) {
				fidelity.push(
					note('typography.inexact-size', 'info', `Font size "${entry.slug}" (${entry.size}) is an expression — ranked by its first numeric term (${px}px).`, { slug: entry.slug }),
				);
			}
			return { ...entry, px };
		})
		// Descending by px; slug tiebreak keeps the ordering deterministic.
		.sort((a, b) => b.px - a.px || compareSlugs(a.slug, b.slug));

	const preferredFont = preferredSlugs?.size ? fonts.find((f) => preferredSlugs.has(f.slug)) : undefined;
	const primaryFamily = preferredFont?.family ?? (fonts.length > 0 ? fonts[0].family : undefined);

	const slots = {};
	const overflow = [];
	ranked.forEach((entry, index) => {
		if (index < TEXT_SLOTS.length) {
			slots[TEXT_SLOTS[index]] = {
				fontSize: cssSize(entry),
				sourceSlug: entry.slug,
				...(entry.name ? { name: entry.name } : {}),
				...(primaryFamily ? { fontFamily: primaryFamily } : {}),
			};
		} else {
			overflow.push({
				slug: entry.slug,
				className: `vsp-text-${entry.slug}`,
				fontSize: cssSize(entry),
			});
		}
	});

	if (overflow.length > 0) {
		fidelity.push(
			note(
				'typography.overflow',
				'warn',
				`Type ramp has ${ranked.length} steps; Wix has exactly 9 text-theme slots (H1–H6, P1–P3). ` +
					`${overflow.length} style(s) spilled into global.css classes (${overflow.map((o) => `.${o.className}`).join(', ')}) — usable in code, invisible in the editor's typography panel.`,
				{ overflow: overflow.map((o) => o.slug) },
			),
		);
	}
	if (ranked.length > 0 && ranked.length < TEXT_SLOTS.length) {
		const unset = TEXT_SLOTS.slice(ranked.length);
		fidelity.push(
			note('typography.partial-ramp', 'info', `Only ${ranked.length} font size(s) extracted — text-theme slots ${unset.join(', ')} keep the template's values.`, { unset }),
		);
	}

	return { typography: { slots, overflow }, fidelity };
}
