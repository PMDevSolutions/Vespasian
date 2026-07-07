// Aggregate the mapper report: IR + mapper warnings, provenance maps, font
// fallbacks, out-of-gamut colors, and fonts to provision downstream.

/**
 * @param {Object} input
 * @param {import('../ir.js').DocumentIR} [input.ir]
 * @param {Array<import('../ir.js').ParseWarningIR>} [input.warnings]  Mapper warnings.
 * @param {Array<{ slug: string, name: string }>} [input.googleFonts]
 * @param {{ swatchToSlug?: object, styleToSlug?: object, fontToSlug?: object }} [input.provenance]
 * @returns {object}
 */
export function buildReport({ ir = {}, warnings = [], googleFonts = [], provenance = {} } = {}) {
	const all = [...(ir.warnings ?? []), ...warnings];
	const byCode = (code) => all.filter((w) => w.code === code);

	return {
		warnings: all,
		fontFallbacks: byCode('font-fallback').map((w) => w.message),
		outOfGamut: byCode('color-out-of-gamut').map((w) => w.message),
		approximations: [
			...byCode('swatch-approximated'),
			...byCode('color-snapped-to-base'),
			...byCode('spacing-approximate'),
			...byCode('pdf-fallback'),
		].map((w) => w.message),
		googleFonts,
		provenance: {
			swatchToSlug: provenance.swatchToSlug ?? {},
			styleToSlug: provenance.styleToSlug ?? {},
			fontToSlug: provenance.fontToSlug ?? {},
		},
		counts: {
			swatches: (ir.swatches ?? []).length,
			fonts: (ir.fonts ?? []).length,
			styles: (ir.styles ?? []).length,
			warnings: all.length,
		},
	};
}
