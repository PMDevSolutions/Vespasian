// Map IR paragraph styles to a neutral font-size scale.
//
// Distinct paragraph-style font sizes are clustered (near-equal sizes merge);
// each cluster becomes one scale entry, reusing a close base font-size slug when
// possible, else a namespaced derived slug named after the InDesign style. Every
// emitted entry is referenced by at least one paragraph style by construction,
// and the styleToSlug provenance map records which.
//
// classifyStyleRole is the shared name → role classifier (Heading N / Body /
// Caption). Downstream drivers use it to bind a style to their own text-theme
// roles (e.g. Wix's H1–H6 + paragraph presets), so the name → role mapping has
// one source of truth.

import { namespacedSlug } from './slug.js';

const DEFAULT_TOLERANCE_PX = 1;
const DEFAULT_FLUID_THRESHOLD_PX = 32;

const HEADING_RE = /^h(?:eading)?\s*([1-6])$/i;
const BODY_RE = /^(body|paragraph|normal|default|text|copy)\b/i;
const CAPTION_RE = /^(caption|footnote|cutline|credit)\b/i;

/**
 * Classify a paragraph style by its InDesign name.
 *
 * @param {unknown} name
 * @returns {{ role: 'heading'|'body'|'caption'|'generic', level?: number }}
 */
export function classifyStyleRole(name) {
	const s = String(name ?? '').trim();
	const h = HEADING_RE.exec(s);
	if (h) return { role: 'heading', level: Number(h[1]) };
	if (BODY_RE.test(s)) return { role: 'body' };
	if (CAPTION_RE.test(s)) return { role: 'caption' };
	return { role: 'generic' };
}

/** @param {number} n @param {number} dp */
function round(n, dp) {
	const f = 10 ** dp;
	return Math.round(n * f) / f;
}

/** @param {number} px → rem string (16px base) */
function pxToRem(px) {
	return `${round(px / 16, 4)}rem`;
}

/** Parse "1rem" / "18px" / unitless into px. */
function remOrPxToPx(token) {
	const m = /^([\d.]+)\s*(rem|px)?$/i.exec(String(token).trim());
	if (!m) return Number.NaN;
	const n = Number.parseFloat(m[1]);
	return m[2] && m[2].toLowerCase() === 'px' ? n : n * 16;
}

/** Resolve a base font-size token to a nominal px (clamp() uses its max). */
function resolveBasePx(size) {
	if (typeof size === 'number') return size;
	const s = String(size).trim();
	const clamp = /clamp\(([^,]+),([^,]+),([^)]+)\)/i.exec(s);
	if (clamp) return remOrPxToPx(clamp[3]);
	return remOrPxToPx(s);
}

/** Fluid pattern for larger sizes: min 85% of max, growing with the viewport. */
function fluidClamp(px) {
	const maxRem = round(px / 16, 4);
	const minRem = round(maxRem * 0.85, 4);
	return `clamp(${minRem}rem, ${minRem}rem + 2vw, ${maxRem}rem)`;
}

/**
 * Greedily cluster styles by font size (ascending), merging sizes within the
 * tolerance of the running cluster mean.
 *
 * @param {Array<import('../ir.js').StyleIR>} paragraphs
 * @param {number} tolerancePx
 * @returns {Array<{ styles: Array<import('../ir.js').StyleIR>, representativePx: number }>}
 */
function clusterBySize(paragraphs, tolerancePx) {
	const sorted = [...paragraphs].sort((a, b) => a.fontSize - b.fontSize);
	const clusters = [];
	for (const style of sorted) {
		const last = clusters[clusters.length - 1];
		if (last) {
			const mean = last.sizes.reduce((s, v) => s + v, 0) / last.sizes.length;
			if (Math.abs(style.fontSize - mean) <= tolerancePx) {
				last.styles.push(style);
				last.sizes.push(style.fontSize);
				continue;
			}
		}
		clusters.push({ styles: [style], sizes: [style.fontSize] });
	}
	return clusters.map((c) => ({
		styles: c.styles,
		representativePx: Math.round(c.sizes.reduce((s, v) => s + v, 0) / c.sizes.length),
	}));
}

/**
 * @typedef {Object} MapTypographyOptions
 * @property {Array<{ slug: string, size: string | number }>} [baseFontSizes]
 * @property {number} [tolerancePx]
 * @property {boolean} [fluid]
 * @property {number} [fluidThresholdPx]
 * @property {string} [namespace]
 *
 * @param {Array<import('../ir.js').StyleIR>} styles
 * @param {MapTypographyOptions} [options]
 * @returns {{ fontSizes: Array<{ slug: string, size: string, name: string }>, styleToSlug: Record<string, string> }}
 */
export function mapTypography(styles, options = {}) {
	const {
		baseFontSizes = [],
		tolerancePx = DEFAULT_TOLERANCE_PX,
		fluid = false,
		fluidThresholdPx = DEFAULT_FLUID_THRESHOLD_PX,
		namespace = 'id',
	} = options;

	const paragraphs = styles.filter(
		(s) => s.kind === 'paragraph' && typeof s.fontSize === 'number' && s.fontSize > 0,
	);
	const clusters = clusterBySize(paragraphs, tolerancePx);

	const used = new Set(baseFontSizes.map((b) => b.slug));
	const baseResolved = baseFontSizes.map((b) => ({ slug: b.slug, px: resolveBasePx(b.size) }));

	/** @type {Array<{ slug: string, size: string, name: string }>} */
	const fontSizes = [];
	/** @type {Record<string, string>} */
	const styleToSlug = {};

	for (const cluster of clusters) {
		// Reuse the closest base slug within tolerance.
		let slug = null;
		let bestDist = Infinity;
		for (const b of baseResolved) {
			const d = Math.abs(b.px - cluster.representativePx);
			if (d <= tolerancePx && d < bestDist) {
				bestDist = d;
				slug = b.slug;
			}
		}

		if (!slug) {
			// Derived token, named after the cluster style closest to the mean.
			const rep = cluster.styles.reduce(
				(best, s) => (Math.abs(s.fontSize - cluster.representativePx) < Math.abs(best.fontSize - cluster.representativePx) ? s : best),
				cluster.styles[0],
			);
			slug = namespacedSlug(rep.name, namespace, used, 'font-size');
			used.add(slug);
			const size = fluid && cluster.representativePx >= fluidThresholdPx
				? fluidClamp(cluster.representativePx)
				: pxToRem(cluster.representativePx);
			fontSizes.push({ slug, size, name: rep.name });
		}

		for (const s of cluster.styles) styleToSlug[s.id] = slug;
	}

	return { fontSizes, styleToSlug };
}
