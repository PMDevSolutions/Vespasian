// End-to-end: mapTokens runs on an IR from either parser (IDML or PDF) and
// produces the tokens artifact — self-contained token groups (base merged with
// derived), DTCG design tokens, and a report with provenance maps. This shape
// is the tokens.json contract @vespasian/wix-driver consumes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapTokens } from '../../src/indesign/map/index.js';
import { parseIdmlBuffer } from '../../src/indesign/parse-idml.js';
import { parsePdfBuffer } from '../../src/indesign/parse-pdf.js';
import { buildIdml } from './helpers/build-idml.js';
import { buildPdf } from './helpers/build-pdf.js';

function buildBrochureIdml() {
	return buildIdml({
		name: 'Brochure',
		colors: [
			{ id: 'col-brand', name: 'Brand Blue', space: 'RGB', values: [0, 102, 204] },
			{ id: 'col-ink', name: 'Ink', space: 'CMYK', values: [0, 0, 0, 100] },
			{ id: 'col-accent', name: 'Accent', space: 'LAB', values: [54, 81, 70] },
		],
		fonts: [
			{ id: 'f-helv', family: 'Helvetica', style: 'Bold', postScriptName: 'Helvetica-Bold' },
			{ id: 'f-bell', family: 'Bell Gothic', style: 'Regular' }, // not in the font map
		],
		styles: [
			{ id: 'p-h1', name: 'Heading 1', kind: 'paragraph', pointSize: 36, leading: 40, appliedFont: 'f-helv', fillColor: 'col-brand' },
			{ id: 'p-body', name: 'Body', kind: 'paragraph', pointSize: 12, leading: 18, appliedFont: 'f-bell', fillColor: 'col-ink' },
		],
		stories: [
			{ id: 'story-h', runs: [{ text: 'Welcome', paragraphStyle: 'p-h1' }] },
			{ id: 'story-b', runs: [{ text: 'Body copy here.', paragraphStyle: 'p-body' }] },
		],
		spreads: [
			{
				id: 'spread-1',
				pages: [{ id: 'page-1', bounds: [0, 0, 792, 612] }],
				frames: [
					{ kind: 'text', id: 'frame-h', bounds: [72, 72, 130, 400], parentStory: 'story-h' },
					{ kind: 'text', id: 'frame-b', bounds: [150, 72, 230, 400], parentStory: 'story-b' },
				],
			},
		],
	});
}

test('maps an IDML-derived IR into a self-contained tokens artifact', () => {
	const ir = parseIdmlBuffer(buildBrochureIdml());
	const tokens = mapTokens(ir);

	// The artifact carries exactly the token groups, DTCG tokens, and report —
	// no WordPress theme.json partial or merged theme.
	assert.deepEqual(
		Object.keys(tokens).sort(),
		['designTokens', 'fontFamilies', 'fontSizes', 'palette', 'report', 'spacingSizes'],
	);

	// Palette = neutral base + all distinct derived swatches (3, none close to base).
	assert.equal(tokens.report.counts.swatches, 3);
	const paletteSlugs = tokens.palette.map((p) => p.slug);
	assert.ok(paletteSlugs.includes('base'), 'base token preserved');
	assert.ok(paletteSlugs.includes('id-brand-blue'), 'derived token added');
	assert.ok(tokens.palette.length >= 8, 'derived colors extend the base palette');

	// Every token entry is {slug, ...value} shaped.
	for (const p of tokens.palette) {
		assert.equal(typeof p.slug, 'string');
		assert.match(p.color, /^#[0-9a-f]{6}$/);
	}
	for (const s of tokens.fontSizes) assert.ok(s.slug && s.size);
	for (const f of tokens.fontFamilies) assert.ok(f.slug && f.fontFamily);
	for (const s of tokens.spacingSizes) assert.ok(s.slug && s.size);

	// Every provenance slug resolves inside this artifact alone.
	const fontSizeSlugs = new Set(tokens.fontSizes.map((s) => s.slug));
	for (const slug of Object.values(tokens.report.provenance.styleToSlug)) {
		assert.ok(fontSizeSlugs.has(slug), `style slug ${slug} unresolved`);
	}
	const familySlugs = new Set(tokens.fontFamilies.map((f) => f.slug));
	for (const slug of Object.values(tokens.report.provenance.fontToSlug)) {
		assert.ok(familySlugs.has(slug), `font slug ${slug} unresolved`);
	}
	const colorSlugs = new Set(paletteSlugs);
	for (const slug of Object.values(tokens.report.provenance.swatchToSlug)) {
		assert.ok(colorSlugs.has(slug), `swatch slug ${slug} unresolved`);
	}

	// 36pt (48px) reuses the base 'display' (3rem) slug; 12pt (16px) reuses 'medium'.
	assert.equal(tokens.report.provenance.styleToSlug['p-h1'], 'display');
	assert.equal(tokens.report.provenance.styleToSlug['p-body'], 'medium');

	// Font fallback warning emitted + listed in the report.
	assert.ok(tokens.report.fontFallbacks.some((m) => /Bell Gothic/.test(m)));

	// DTCG output covers the full merged set.
	assert.ok(tokens.designTokens.color['id-brand-blue']);
	assert.ok(tokens.designTokens.color.base);
	assert.equal(tokens.designTokens.color['id-brand-blue'].$type, 'color');
	assert.ok(tokens.designTokens.fontSize.display);
	assert.ok(tokens.designTokens.spacing['space-40']);
});

test('maps a PDF-derived IR into the same artifact shape (source-agnostic)', async () => {
	const toUnit = ([r, g, b]) => [r / 255, g / 255, b / 255];
	const pdf = buildPdf({
		title: 'Brochure PDF',
		pages: [
			{
				width: 612,
				height: 792,
				texts: [
					// Teal headline — clearly outside the base palette, so it derives a token.
					{ text: 'Welcome', x: 72, y: 96, size: 36, font: 'Helvetica-Bold', color: toUnit([20, 184, 166]) },
					{ text: 'Body copy that wraps across the column nicely.', x: 72, y: 150, size: 12, font: 'Helvetica', color: toUnit([0, 0, 0]) },
				],
			},
		],
	});
	const ir = await parsePdfBuffer(pdf);
	const tokens = mapTokens(ir);

	assert.ok(tokens.palette.length >= 6, 'a distinct headline color extends the base palette');
	assert.ok(tokens.designTokens.color, 'DTCG color group present');
	// Styles synthesized from the PDF were mapped to typography slugs.
	assert.ok(Object.keys(tokens.report.provenance.styleToSlug).length > 0);
	// PDF parses always carry fidelity warnings → surfaced through the report.
	assert.ok(tokens.report.warnings.length > 0);
});

test('mapTokens is deterministic for a given IR', () => {
	const ir = parseIdmlBuffer(buildBrochureIdml());
	const a = JSON.stringify(mapTokens(ir));
	const b = JSON.stringify(mapTokens(ir));
	assert.equal(a, b);
});
