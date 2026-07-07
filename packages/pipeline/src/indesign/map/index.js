// Token mapper orchestrator: a validated InDesign IR (from either parser) →
// neutral design tokens.
//
//   mapTokens(ir, options) → { palette, fontSizes, fontFamilies, spacingSizes,
//                              designTokens, report }
//
//   palette/fontSizes/fontFamilies/spacingSizes
//                the complete token set: the bundled (or supplied) base token
//                set merged by slug with the design-derived, namespaced tokens
//   designTokens the same set as DTCG / Style Dictionary interchange
//   report       warnings, provenance maps, font fallbacks, counts
//
// This whole object is the `tokens.json` artifact. Downstream drivers (e.g.
// @vespasian/wix-driver) consume it as a file next to ir.json and
// assets.manifest.json — there are no code imports between the packages, so
// the JSON shape here is the contract.

import { readFileSync } from 'node:fs';

import { WarningCollector } from '../warnings.js';
import { slugify } from './slug.js';
import { mapColors } from './colors.js';
import { mapFonts, loadFontMap } from './fonts.js';
import { mapTypography } from './typography.js';
import { mapSpacing } from './spacing.js';
import { toDesignTokens } from './design-tokens.js';
import { buildReport } from './report.js';

const DEFAULT_BASE_TOKENS_URL = new URL('../../../config/base-tokens.json', import.meta.url);

/** Load a base token set from an object, a path, or the bundled default. */
function loadBaseTokens(base) {
	if (base && typeof base === 'object') return base;
	return JSON.parse(readFileSync(base ?? DEFAULT_BASE_TOKENS_URL, 'utf8'));
}

/** Merge two token arrays by `slug`; later entries override/extend earlier ones. */
function mergeBySlug(baseArr = [], derivedArr = []) {
	const bySlug = new Map();
	for (const item of baseArr) bySlug.set(item.slug, item);
	for (const item of derivedArr) bySlug.set(item.slug, { ...(bySlug.get(item.slug) ?? {}), ...item });
	return [...bySlug.values()];
}

/**
 * @typedef {Object} MapTokensOptions
 * @property {object|string} [base]    Base token set object or path (default: bundled config/base-tokens.json).
 * @property {object|string} [fontMap] Font map object or path (default: bundled config).
 * @property {string} [namespace]      Derived-token slug prefix (default 'id').
 * @property {number} [tolerance]      Color squared-distance tolerance.
 * @property {number} [tolerancePx]    Typography size clustering tolerance (px).
 * @property {number} [gridPx]         Spacing quantization grid (px).
 * @property {boolean} [fluid]         Emit fluid clamp() font sizes.
 *
 * @param {import('../ir.js').DocumentIR} ir
 * @param {MapTokensOptions} [options]
 * @returns {{ palette: Array<object>, fontSizes: Array<object>, fontFamilies: Array<object>, spacingSizes: Array<object>, designTokens: object, report: object }}
 */
export function mapTokens(ir, options = {}) {
	const {
		base,
		fontMap,
		namespace = 'id',
		tolerance,
		tolerancePx,
		gridPx,
		fluid,
	} = options;

	const baseTokens = loadBaseTokens(base);
	const warnings = new WarningCollector();

	const basePalette = baseTokens?.palette ?? [];
	const baseFontSizes = baseTokens?.fontSizes ?? [];
	const baseFontFamilies = baseTokens?.fontFamilies ?? [];
	const baseSpacingSizes = baseTokens?.spacingSizes ?? [];

	const { palette: derivedPalette, swatchToSlug } = mapColors(ir.swatches ?? [], {
		basePalette,
		tolerance,
		namespace,
		warnings,
	});

	const resolvedFontMap = fontMap && typeof fontMap === 'object' ? fontMap : loadFontMap(fontMap);
	const { fontFamilies: derivedFontFamilies, fontToSlug, googleFonts } = mapFonts(ir.fonts ?? [], {
		fontMap: resolvedFontMap,
		baseFontFamilies,
		namespace,
		warnings,
	});

	const { fontSizes: derivedFontSizes, styleToSlug } = mapTypography(ir.styles ?? [], {
		baseFontSizes,
		tolerancePx,
		fluid,
		namespace,
	});

	const { spacingSizes: derivedSpacingSizes } = mapSpacing(ir, { gridPx, namespace, warnings });

	// The emitted groups are self-contained: base tokens first, derived tokens
	// merged in by slug, so every slug in the provenance maps resolves within
	// this artifact alone.
	const palette = mergeBySlug(basePalette, derivedPalette);
	const fontSizes = mergeBySlug(baseFontSizes, derivedFontSizes);
	const fontFamilies = mergeBySlug(baseFontFamilies, derivedFontFamilies);
	const spacingSizes = mergeBySlug(baseSpacingSizes, derivedSpacingSizes);

	const designTokens = toDesignTokens({ palette, fontSizes, fontFamilies, spacingSizes });

	const report = buildReport({
		ir,
		warnings: warnings.list(),
		googleFonts,
		provenance: { swatchToSlug, styleToSlug, fontToSlug },
	});

	return { palette, fontSizes, fontFamilies, spacingSizes, designTokens, report };
}

// slugify is re-exported for callers that want to derive a namespace from a name.
export { slugify };
