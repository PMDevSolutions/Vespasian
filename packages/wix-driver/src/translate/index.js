// translate/ — design tokens → ThemePlan + global.css (+ FidelityNotes).
//
// The Vespasian analog of Flavian's theme.json generator: instead of theme
// files, it emits (a) a ThemePlan the editor flows execute against the Site
// Styles panels and (b) a global.css artifact for the CLI channel. Every
// translation loss is a FidelityNote — honest degradation over silent drift.

import { normalizeTokens, note } from './schemas.js';
import { translatePalette, normalizeHex } from './palette.js';
import { translateTypography } from './typography.js';
import { translateFonts } from './fonts.js';
import { translateSpacing } from './spacing.js';
import { assembleGlobalCss } from './css.js';

export { normalizeTokens, TokensSchema, FidelityNoteSchema, note } from './schemas.js';
export { translatePalette, normalizeHex, MAX_SITE_COLORS, ROLE_ORDER } from './palette.js';
export { translateTypography, sizeToPx, TEXT_SLOTS } from './typography.js';
export { translateFonts, loadBuiltinFonts, primaryFamily, FONT_UPLOAD_MAX_BYTES } from './fonts.js';
export { translateSpacing } from './spacing.js';
export { assembleGlobalCss } from './css.js';

/**
 * @param {object} rawTokens  Plain parsed tokens.json (mapTokens output shape
 *   or a theme.json-style partial) — never a live pipeline import.
 * @returns {{ themePlan: object, globalCss: string, fidelity: Array<object> }}
 */
export function translateTokens(rawTokens) {
	const tokens = normalizeTokens(rawTokens);
	const fidelity = [];

	const paletteResult = translatePalette(tokens.palette);
	fidelity.push(...paletteResult.fidelity);

	const fontsResult = translateFonts(tokens.fontFamilies);
	fidelity.push(...fontsResult.fidelity);

	// Families the document actually contributed (mapTokens provenance) must
	// win the theme slots over the bundled base placeholder stacks.
	const derivedFontSlugs = new Set(Object.values(tokens.report?.provenance?.fontToSlug ?? {}));
	const typographyResult = translateTypography(tokens.fontSizes, fontsResult.fonts, { preferredSlugs: derivedFontSlugs });
	fidelity.push(...typographyResult.fidelity);

	const spacingResult = translateSpacing(tokens.spacingSizes);
	fidelity.push(...spacingResult.fidelity);

	if (tokens.palette.length === 0 && tokens.fontSizes.length === 0 && tokens.spacingSizes.length === 0) {
		fidelity.push(note('translate.empty-tokens', 'warn', 'No palette, font sizes, or spacing sizes in the token input — ThemePlan is empty; the template design survives unchanged.'));
	}

	// Mapper warnings recorded at token-mapping time (color snaps, font
	// fallbacks, approximations) are translation losses too — surface them so
	// they reach the plan report and the FidelityReport.
	for (const warning of tokens.report?.warnings ?? []) {
		if (!warning?.code || !warning?.message) continue;
		fidelity.push(note(`mapper.${warning.code}`, 'warn', String(warning.message)));
	}

	// --vsp-color-* variables cover the FULL normalized palette, including
	// colors truncated out of the 25 site-color slots.
	const allColors = tokens.palette
		.map((entry) => {
			const value = paletteResult.colors.siteColors.find((c) => c.slug === entry.slug)?.value;
			return value ? { slug: entry.slug, value } : null;
		})
		.filter(Boolean);
	// Include truncated colors (normalized) as CSS-only survivors.
	for (const slug of paletteResult.colors.truncated) {
		if (!allColors.some((c) => c.slug === slug)) {
			const source = tokens.palette.find((p) => p.slug === slug);
			const hex = normalizeHex(source?.color);
			if (hex) allColors.push({ slug, value: hex });
		}
	}

	const globalCss = assembleGlobalCss({
		colors: paletteResult.colors,
		allColors,
		typography: typographyResult.typography,
		spacingCss: spacingResult.css,
	});

	const themePlan = {
		colors: paletteResult.colors,
		typography: typographyResult.typography,
		fonts: fontsResult.fonts,
		spacing: spacingResult.spacing,
	};

	return { themePlan, globalCss, fidelity };
}
