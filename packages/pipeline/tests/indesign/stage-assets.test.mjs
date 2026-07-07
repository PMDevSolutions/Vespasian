// The asset-staging stage: source (.idml/.pdf) → a driver-ready bundle on
// disk (ir.json + assets/ + assets.manifest.json). These tests pin three things:
//   1. the transform that joins IR image frames to extracted bytes by href,
//   2. the manifest shape (provenance, no bytes), and
//   3. an end-to-end IDML run whose staged filenames line up byte-for-byte with
//      the planAssets naming pass — i.e. any consumer that re-plans the same IR
//      (or reads assets.manifest.json) resolves the staged files exactly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Document } from '../../src/indesign/ir.js';
import { resolveAssets, buildAssetBundle, runAssetStage } from '../../src/indesign/assets/stage.js';
import { planAssets } from '../../src/indesign/assets/plan-assets.js';
import { buildIdml } from './helpers/build-idml.js';

/** A one-spread IR with one resolvable image frame and one dangling one. */
function twoImageIr() {
	return Document.parse({
		dpi: 96,
		swatches: [],
		fonts: [],
		styles: [],
		stories: [],
		masterSpreads: [],
		spreads: [
			{
				id: 'sp',
				source: 'Spreads/Spread_sp.xml',
				pages: [{ id: 'p', bounds: { x: 0, y: 0, width: 600, height: 400 } }],
				frames: [
					{ kind: 'image', id: 'img', bounds: { x: 0, y: 0, width: 600, height: 400 }, href: 'file:Resources/hero.jpg', embedded: true },
					{ kind: 'image', id: 'img2', bounds: { x: 0, y: 0, width: 100, height: 100 }, href: 'file:Links/missing.png', embedded: true },
				],
			},
		],
	});
}

function resolverWithHero() {
	return new Map([
		['file:Resources/hero.jpg', { bytes: new TextEncoder().encode('JPEGDATA-hero'), ext: 'jpg' }],
	]);
}

test('resolveAssets joins image frames to extracted bytes by href', () => {
	const { assets, counts, warnings } = resolveAssets(twoImageIr(), resolverWithHero());

	assert.equal(assets.length, 2);

	const hero = assets.find((a) => a.frameId === 'img');
	assert.equal(hero.resolved, true);
	assert.equal(hero.relPath, 'assets/spread-1-image-1.jpg');
	assert.ok(hero.bytes instanceof Uint8Array);
	assert.deepEqual(hero.bytes, new TextEncoder().encode('JPEGDATA-hero'));

	const missing = assets.find((a) => a.frameId === 'img2');
	assert.equal(missing.resolved, false);
	assert.equal(missing.relPath, 'assets/spread-1-image-2.png');
	assert.equal(missing.bytes, undefined);

	assert.deepEqual(counts, { resolved: 1, unresolved: 1 });
	assert.equal(warnings.filter((w) => w.code === 'asset-unresolved').length, 1);
});

test('buildAssetBundle records provenance in the manifest without embedding bytes', () => {
	const bundle = buildAssetBundle({ ir: twoImageIr(), resolver: resolverWithHero(), format: 'idml' });

	assert.equal(bundle.manifest.bundleVersion, 1);
	assert.equal(bundle.manifest.source.format, 'idml');
	assert.deepEqual(bundle.manifest.counts, {
		spreads: 1,
		imageFrames: 2,
		assetsResolved: 1,
		assetsUnresolved: 1,
	});

	// Manifest entries are provenance only — bytes are written separately.
	const entry = bundle.manifest.assets.find((a) => a.frameId === 'img');
	assert.deepEqual(entry, {
		frameId: 'img',
		href: 'file:Resources/hero.jpg',
		embedded: true,
		relPath: 'assets/spread-1-image-1.jpg',
		resolved: true,
	});
	assert.ok(!('bytes' in entry), 'manifest must not carry raw bytes');

	// The in-memory bundle keeps bytes so the writer can stage them.
	const live = bundle.assets.find((a) => a.frameId === 'img');
	assert.ok(live.bytes instanceof Uint8Array);

	// The unresolved frame is surfaced as a warning in the manifest.
	assert.ok(bundle.manifest.warnings.some((w) => w.code === 'asset-unresolved'));
});

test('runAssetStage writes a driver-ready bundle from an .idml (assets aligned with planAssets)', async () => {
	const heroBytes = 'JPEGDATA-hero-frame';
	const idml = buildIdml({
		name: 'Stage Fixture',
		spreads: [
			{
				id: 'sp1',
				pages: [{ id: 'pg1', bounds: [0, 0, 600, 400] }],
				frames: [{ kind: 'image', id: 'hero', bounds: [0, 0, 600, 400], href: 'file:Resources/hero.jpg' }],
			},
		],
		extraFiles: { 'Resources/hero.jpg': heroBytes },
	});

	const work = await fs.mkdtemp(path.join(os.tmpdir(), 'vespasian-stage-'));
	const idmlPath = path.join(work, 'fixture.idml');
	const outDir = path.join(work, 'bundle');

	try {
		await fs.writeFile(idmlPath, idml);

		const summary = await runAssetStage({ input: idmlPath, outDir });
		assert.equal(summary.format, 'idml');
		assert.equal(summary.counts.assetsResolved, 1);

		// ir.json round-trips through the schema — it is the intermediate JSON
		// downstream stages consume.
		const irJson = JSON.parse(await fs.readFile(path.join(outDir, 'ir.json'), 'utf8'));
		const reparsed = Document.parse(irJson);
		assert.equal(reparsed.spreads.length, 1);

		// The extracted image landed at the planned staged filename.
		const stagedRel = 'assets/spread-1-image-1.jpg';
		const staged = await fs.readFile(path.join(outDir, stagedRel));
		assert.deepEqual(new Uint8Array(staged), new TextEncoder().encode(heroBytes));

		// Manifest written and consistent.
		const manifest = JSON.parse(await fs.readFile(path.join(outDir, 'assets.manifest.json'), 'utf8'));
		assert.equal(manifest.counts.assetsResolved, 1);
		assert.equal(manifest.assets[0].relPath, stagedRel);

		// The payoff: re-running the naming pass on the bundle's ir.json yields
		// the exact path the stage staged — the deterministic-naming contract
		// downstream drivers rely on.
		const { assets: replanned, assetPathById } = planAssets(irJson);
		assert.equal(replanned.find((a) => a.frameId === 'hero').relPath, stagedRel);
		assert.equal(assetPathById.get('hero'), stagedRel);
	} finally {
		await fs.rm(work, { recursive: true, force: true });
	}
});
