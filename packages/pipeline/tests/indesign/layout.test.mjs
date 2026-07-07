// layoutSpread: pure spread geometry → reading-order rows with column grouping
// and cover (text-over-image) detection. Downstream drivers map these rows onto
// their own layout primitives (e.g. Wix sections and column grids), so the row
// structure is snapshot-pinned. Snapshots live in __snapshots__/ and update
// with UPDATE_SNAPSHOTS=1.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { layoutSpread } from '../../src/indesign/layout.js';

const SNAP_DIR = fileURLToPath(new URL('./__snapshots__/', import.meta.url));

/** Compare against a committed snapshot, or write it when UPDATE_SNAPSHOTS is set. */
function matchSnapshot(name, actual) {
	const file = path.join(SNAP_DIR, name);
	if (process.env.UPDATE_SNAPSHOTS) {
		mkdirSync(SNAP_DIR, { recursive: true });
		writeFileSync(file, actual);
		return;
	}
	let expected;
	try {
		expected = readFileSync(file, 'utf8');
	} catch {
		throw new Error(`Missing snapshot ${name}. Re-run with UPDATE_SNAPSHOTS=1 to create it.`);
	}
	assert.equal(actual, expected, `snapshot ${name} drifted`);
}

const text = (id, x, y, width, height) => ({ kind: 'text', id, bounds: { x, y, width, height } });
const image = (id, x, y, width, height) => ({ kind: 'image', id, bounds: { x, y, width, height } });

test('orders stacked frames top-to-bottom into single-item rows', () => {
	const frames = [
		text('b', 0, 300, 400, 100),
		text('a', 0, 0, 400, 100),
		text('c', 0, 600, 400, 100),
	];
	const rows = layoutSpread(frames);
	assert.deepEqual(rows.map((r) => r.items.map((i) => i.frame.id)), [['a'], ['b'], ['c']]);
});

test('groups vertically-overlapping frames into one row, left to right', () => {
	const frames = [
		text('right', 300, 10, 200, 100), // overlaps 'left' by >50% of the shorter height
		text('left', 0, 0, 200, 100),
		text('below', 0, 300, 500, 100),
	];
	const rows = layoutSpread(frames);
	assert.equal(rows.length, 2);
	assert.deepEqual(rows[0].items.map((i) => i.frame.id), ['left', 'right']);
	assert.deepEqual(rows[1].items.map((i) => i.frame.id), ['below']);
});

test('a small vertical overlap does not merge rows', () => {
	const frames = [
		text('a', 0, 0, 400, 100),
		text('b', 200, 90, 400, 100), // only 10px overlap of a 100px height → 10%
	];
	const rows = layoutSpread(frames);
	assert.equal(rows.length, 2);
});

test('detects covers: text mostly inside an image nests as overlay children', () => {
	const frames = [
		image('hero', 0, 0, 600, 800),
		text('overlay', 100, 100, 300, 200),  // fully inside → consumed
		text('caption', 0, 850, 600, 60),      // outside → normal flow
	];
	const rows = layoutSpread(frames);
	assert.equal(rows.length, 2);
	const heroItem = rows[0].items[0];
	assert.equal(heroItem.frame.id, 'hero');
	assert.deepEqual(heroItem.coverChildren.map((f) => f.id), ['overlay']);
	assert.deepEqual(rows[1].items.map((i) => i.frame.id), ['caption']);
});

test('a text frame less than 60% inside an image stays in flow', () => {
	const frames = [
		image('hero', 0, 0, 300, 300),
		// Half in, half out: 50% containment < 60% threshold.
		text('straddle', 150, 0, 300, 300),
	];
	const rows = layoutSpread(frames);
	const allFlowIds = rows.flatMap((r) => r.items.map((i) => i.frame.id));
	assert.ok(allFlowIds.includes('straddle'));
	assert.equal(rows[0].items.find((i) => i.frame.id === 'hero').coverChildren.length, 0);
});

test('is deterministic and snapshot-stable for a representative spread', () => {
	const frames = [
		image('hero', 0, 0, 792, 400),
		text('headline', 100, 80, 500, 120),   // overlaid on the hero
		text('col-left', 40, 460, 340, 300),
		text('col-right', 410, 460, 340, 300), // same band → columns
		text('footer-note', 40, 800, 712, 60),
	];
	const a = JSON.stringify(layoutSpread(frames), null, 2);
	const b = JSON.stringify(layoutSpread(frames), null, 2);
	assert.equal(a, b, 'same frames must yield byte-identical layout');
	matchSnapshot('layout-cover-spread.json', `${a}\n`);
});
