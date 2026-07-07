// Palette → Wix Studio site-color slots.
//
// Studio's model: role-connected default colors (primary background,
// secondary background, disabled, secondary text, primary text,
// links/actions — the six documented "Color 1..6" roles) plus up to 25 named
// site colors total. There is NO theme write API: the output here is a plan
// for the themeColors editor flow, with every shade as an explicit hex value
// (Wix auto-generates shade gradients that drift from extracted values).
//
// Every loss — truncation past 25, synthesized role fallbacks — lands in the
// FidelityNote list.

import { note } from './schemas.js';

export const MAX_SITE_COLORS = 25;

/** Studio role slots in their documented "Color N" order. */
export const ROLE_ORDER = [
	'primary-background',
	'secondary-background',
	'disabled',
	'secondary-text',
	'primary-text',
	'links-actions',
];

/** Normalize any #rgb/#rrggbb string to uppercase #RRGGBB; null if unparseable. */
export function normalizeHex(value) {
	if (typeof value !== 'string') return null;
	const raw = value.trim();
	const short = /^#?([0-9a-f]{3})$/i.exec(raw);
	if (short) {
		const [r, g, b] = short[1];
		return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
	}
	const long = /^#?([0-9a-f]{6})$/i.exec(raw);
	if (long) return `#${long[1]}`.toUpperCase();
	return null;
}

function rgbOf(hex) {
	return {
		r: Number.parseInt(hex.slice(1, 3), 16),
		g: Number.parseInt(hex.slice(3, 5), 16),
		b: Number.parseInt(hex.slice(5, 7), 16),
	};
}

/** Relative luminance (WCAG-ish, good enough for ranking). */
function luminance(hex) {
	const { r, g, b } = rgbOf(hex);
	return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Saturation as max-min channel spread (0..1). */
function saturation(hex) {
	const { r, g, b } = rgbOf(hex);
	return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

/**
 * Compress/assign a token palette to Wix Studio site-color slots.
 *
 * @param {Array<{ slug: string, color: string, name?: string }>} palette
 * @returns {{ colors: { roles: Record<string, { slug: string, value: string, synthesized?: boolean }>,
 *             siteColors: Array<{ slug: string, name: string, value: string }>,
 *             truncated: string[] }, fidelity: import('./schemas.js').FidelityNote[] }}
 */
export function translatePalette(palette) {
	const fidelity = [];

	// Parse + normalize; drop unparseable colors with a note.
	const entries = [];
	for (const entry of palette) {
		const hex = normalizeHex(entry.color);
		if (!hex) {
			fidelity.push(
				note('palette.unparseable-color', 'warn', `Palette entry "${entry.slug}" has a non-hex color (${entry.color}) — skipped (gradients/CSS functions are not representable as Wix site colors).`, { slug: entry.slug }),
			);
			continue;
		}
		entries.push({ slug: entry.slug, name: entry.name ?? entry.slug, value: hex });
	}

	// ---- Role assignment (deterministic; ties broken by input order) ----
	const roles = {};
	const unassigned = [...entries];
	const take = (picker) => {
		if (unassigned.length === 0) return undefined;
		let best = unassigned[0];
		let bestScore = picker(best);
		for (const candidate of unassigned.slice(1)) {
			const score = picker(candidate);
			if (score > bestScore) {
				best = candidate;
				bestScore = score;
			}
		}
		unassigned.splice(unassigned.indexOf(best), 1);
		return best;
	};

	const lightest = take((e) => luminance(e.value));
	if (lightest) roles['primary-background'] = { slug: lightest.slug, value: lightest.value };

	const darkest = take((e) => 1 - luminance(e.value));
	if (darkest) roles['primary-text'] = { slug: darkest.slug, value: darkest.value };

	const accent = take((e) => saturation(e.value));
	if (accent) roles['links-actions'] = { slug: accent.slug, value: accent.value };

	const secondaryText = take((e) => 1 - luminance(e.value));
	if (secondaryText) roles['secondary-text'] = { slug: secondaryText.slug, value: secondaryText.value };

	const secondaryBackground = take((e) => luminance(e.value));
	if (secondaryBackground) roles['secondary-background'] = { slug: secondaryBackground.slug, value: secondaryBackground.value };

	// Disabled: prefer a low-saturation mid tone; synthesize a grey when the
	// palette has nothing suitable left.
	const disabled = take((e) => 1 - saturation(e.value) - Math.abs(luminance(e.value) - 0.5));
	if (disabled) {
		roles.disabled = { slug: disabled.slug, value: disabled.value };
	} else {
		roles.disabled = { slug: 'vsp-synth-disabled', value: '#CCCCCC', synthesized: true };
		fidelity.push(note('palette.synthesized-role', 'info', 'No palette color left for the "disabled" role — synthesized #CCCCCC.', { role: 'disabled' }));
	}

	// Reuse fallbacks for any role that stayed empty (tiny palettes).
	for (const role of ROLE_ORDER) {
		if (!roles[role]) {
			const fallback = entries[0] ?? { slug: 'vsp-synth', value: role.includes('background') ? '#FFFFFF' : '#000000' };
			roles[role] = { slug: fallback.slug, value: fallback.value, synthesized: true };
			fidelity.push(note('palette.synthesized-role', 'info', `Palette too small for the "${role}" role — reused ${fallback.value}.`, { role }));
		}
	}

	// ---- Named site colors: role picks first, then remaining input order ----
	const ordered = [];
	const seen = new Set();
	for (const role of ROLE_ORDER) {
		const pick = roles[role];
		if (pick.synthesized) continue;
		const entry = entries.find((e) => e.slug === pick.slug);
		if (entry && !seen.has(entry.slug)) {
			ordered.push(entry);
			seen.add(entry.slug);
		}
	}
	for (const entry of entries) {
		if (!seen.has(entry.slug)) {
			ordered.push(entry);
			seen.add(entry.slug);
		}
	}

	const siteColors = ordered.slice(0, MAX_SITE_COLORS);
	const truncated = ordered.slice(MAX_SITE_COLORS).map((e) => e.slug);
	if (truncated.length > 0) {
		fidelity.push(
			note(
				'palette.truncated',
				'warn',
				`Palette has ${ordered.length} colors; Wix Studio allows ${MAX_SITE_COLORS} site colors — dropped: ${truncated.join(', ')}. Dropped colors remain available as --vsp-color-* variables in global.css only.`,
				{ dropped: truncated },
			),
		);
	}

	return { colors: { roles, siteColors, truncated }, fidelity };
}
