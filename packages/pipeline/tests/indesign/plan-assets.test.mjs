// planAssets: the pipeline's single deterministic naming pass for image
// assets. The asset stage writes bytes to these paths and downstream drivers
// resolve them from assets.manifest.json, so the names must be stable,
// index-based, and collision-free.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planAssets, assetFileName } from '../../src/indesign/assets/plan-assets.js';

test('assetFileName is 1-based, index-keyed, and keeps the href extension', () => {
	assert.equal(assetFileName(0, 0, 'file:Links/hero.jpg'), 'spread-1-image-1.jpg');
	assert.equal(assetFileName(1, 2, 'file:Links/photo.TIF'), 'spread-2-image-3.tif');
	// Query/fragment suffixes never leak into the extension.
	assert.equal(assetFileName(0, 0, 'file:Links/pic.png?rev=2'), 'spread-1-image-1.png');
	// No usable extension → png default.
	assert.equal(assetFileName(0, 1, undefined), 'spread-1-image-2.png');
	assert.equal(assetFileName(0, 1, 'file:Links/raw'), 'spread-1-image-2.png');
});

test('plans one staged asset per image frame, skipping text frames', () => {
	const ir = {
		spreads: [
			{
				id: 'sp1',
				frames: [
					{ kind: 'text', id: 't1', bounds: { x: 0, y: 0, width: 10, height: 10 } },
					{ kind: 'image', id: 'i1', href: 'file:Links/a.jpg', embedded: true },
					{ kind: 'image', id: 'i2', href: 'file:Links/b.png', embedded: false },
				],
			},
			{
				id: 'sp2',
				frames: [{ kind: 'image', id: 'i3' }],
			},
		],
	};
	const { assets, assetPathById } = planAssets(ir);

	assert.deepEqual(assets.map((a) => a.relPath), [
		'assets/spread-1-image-1.jpg',
		'assets/spread-1-image-2.png',
		'assets/spread-2-image-1.png',
	]);
	assert.deepEqual(assets.map((a) => a.frameId), ['i1', 'i2', 'i3']);
	assert.equal(assets[0].embedded, true);
	assert.equal(assets[1].embedded, false);
	assert.equal(assetPathById.get('i2'), 'assets/spread-1-image-2.png');
	assert.equal(assetPathById.has('t1'), false);
});

test('duplicated hrefs never collide — names are index-based', () => {
	const ir = {
		spreads: [
			{
				id: 'sp1',
				frames: [
					{ kind: 'image', id: 'a', href: 'file:Links/same.jpg' },
					{ kind: 'image', id: 'b', href: 'file:Links/same.jpg' },
				],
			},
		],
	};
	const { assets } = planAssets(ir);
	const names = assets.map((a) => a.name);
	assert.equal(new Set(names).size, names.length, 'staged names must be unique');
});

test('is deterministic — same IR yields the same plan', () => {
	const ir = {
		spreads: [
			{ id: 'sp1', frames: [{ kind: 'image', id: 'x', href: 'file:Links/x.gif' }] },
		],
	};
	assert.deepEqual(
		JSON.parse(JSON.stringify(planAssets(ir).assets)),
		JSON.parse(JSON.stringify(planAssets(ir).assets)),
	);
});
