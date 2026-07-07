// End-to-end: the canonical Spring Brochure fixture runs through the
// design-ingestion pipeline (parse → map tokens) for BOTH input formats and
// produces a valid IR plus a populated neutral token set — the artifacts the
// Wix output layer (@vespasian/wix-driver) compiles into a BuildPlan.
// A representative .idml and a representative exported PDF must both work.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseIdmlBuffer } from '../../../packages/pipeline/src/indesign/parse-idml.js';
import { parsePdfBuffer } from '../../../packages/pipeline/src/indesign/parse-pdf.js';
import { mapTokens } from '../../../packages/pipeline/src/indesign/map/index.js';
import { buildBrochureIdml, buildBrochurePdf, BROCHURE_NAME } from './brochure.mjs';

/** Assert a mapped token set is populated and carries provenance reporting. */
function assertWorkingTokens(tokens) {
	assert.ok(tokens.palette.length > 0, 'token set has colors');
	assert.ok(tokens.fontSizes.length > 0, 'token set has font sizes');
	assert.ok(tokens.fontFamilies.length > 0, 'token set has font families');
	assert.ok(tokens.spacingSizes.length > 0, 'token set has spacing sizes');

	// Every token group entry carries a slug — the merge/override key and the
	// downstream translation key (Wix theme slots, --vsp-* custom properties).
	for (const group of ['palette', 'fontSizes', 'fontFamilies', 'spacingSizes']) {
		for (const entry of tokens[group]) {
			assert.ok(entry.slug, `${group} entry has a slug`);
		}
	}

	// The interchange + provenance artifacts are emitted alongside.
	assert.ok(tokens.designTokens, 'DTCG designTokens emitted');
	assert.ok(tokens.report, 'provenance report emitted');
}

test('IDML fixture → valid IR + populated token set (primary path)', () => {
	const ir = parseIdmlBuffer(buildBrochureIdml());
	assert.equal(ir.meta.name, BROCHURE_NAME);
	assert.equal(ir.spreads.length, 2);

	// The document's styled stories are present for the content model.
	assert.ok(ir.stories?.length >= 1 || ir.spreads.some((s) => s.frames?.length), 'IR carries content');

	const tokens = mapTokens(ir);
	assertWorkingTokens(tokens);
});

test('PDF fixture → valid IR + populated token set (fallback path, with fidelity warnings)', async () => {
	const ir = await parsePdfBuffer(buildBrochurePdf());
	assert.ok(ir.spreads.length >= 1);

	const tokens = mapTokens(ir);
	assertWorkingTokens(tokens);

	// A PDF parse is lossy by definition — it always carries fidelity warnings.
	assert.ok((ir.warnings ?? []).length > 0, 'PDF parse should record fidelity warnings');
});

test('both input formats import the same brochure (source-agnostic)', async () => {
	const fromIdml = parseIdmlBuffer(buildBrochureIdml());
	const fromPdf = await parsePdfBuffer(buildBrochurePdf());

	// Same logical document → same spread count from either source.
	assert.equal(fromIdml.spreads.length, 2);
	assert.equal(fromPdf.spreads.length, fromIdml.spreads.length);

	// Both sources produce a non-empty palette from the same document colors.
	assert.ok(mapTokens(fromIdml).palette.length > 0);
	assert.ok(mapTokens(fromPdf).palette.length > 0);
});
