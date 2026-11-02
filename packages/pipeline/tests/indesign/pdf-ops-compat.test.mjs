// extract.js is otherwise exercised only through a real pdfjs build; this pins
// the two pdfjs-version-sensitive seams in its operator-list walk:
//   - fill-color args: pdfjs 4 emitted numeric channels, pdfjs >= 5 emits one
//     "#rrggbb" string for every fill space
//   - path painting: pdfjs 4 emitted fill/stroke as their own entries, pdfjs >= 5
//     folds the painting op into constructPath's first argument
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFillColor, isVectorPaintOp } from '../../src/indesign/pdf/extract.js';

// A stand-in for pdfjs's OPS enum: only the numbers need to be distinct.
const OPS = {
	setFillRGBColor: 59,
	setFillGray: 57,
	setFillCMYKColor: 61,
	constructPath: 91,
	fill: 22,
	eoFill: 23,
	stroke: 20,
	fillStroke: 24,
	eoFillStroke: 25,
	closeFillStroke: 27,
	closeEOFillStroke: 28,
	closeStroke: 21,
	endPath: 29,
	rectangle: 19,
};

test('readFillColor: pdfjs >= 5 emits a single "#rrggbb" string for every fill space', () => {
	const fill = readFillColor(OPS, OPS.setFillRGBColor, ['#0066cc']);
	assert.equal(fill.hex, '#0066cc');
	assert.deepEqual(fill.color, { space: 'RGB', components: [0, 102, 204] });
});

test('readFillColor: pdfjs 4 emitted numeric channels per color space', () => {
	assert.deepEqual(readFillColor(OPS, OPS.setFillRGBColor, [0, 102, 204]), {
		hex: '#0066cc',
		color: { space: 'RGB', components: [0, 102, 204] },
	});
	assert.deepEqual(readFillColor(OPS, OPS.setFillGray, [128]), {
		hex: '#808080',
		color: { space: 'RGB', components: [128, 128, 128] },
	});
	const cmyk = readFillColor(OPS, OPS.setFillCMYKColor, [0, 0.5, 1, 0]);
	assert.equal(cmyk.hex, '#ff8000');
	assert.deepEqual(cmyk.color, { space: 'CMYK', components: [0, 50, 100, 0] });
});

test('isVectorPaintOp: pdfjs 4 emitted the painting op as its own entry', () => {
	assert.equal(isVectorPaintOp(OPS, OPS.fill, []), true);
	assert.equal(isVectorPaintOp(OPS, OPS.closeStroke, []), true);
	// pdfjs 4 constructPath carried [ops[], coords[]] and never a painting op.
	assert.equal(isVectorPaintOp(OPS, OPS.constructPath, [[OPS.rectangle], [0, 0, 10, 10]]), false);
});

test('isVectorPaintOp: pdfjs >= 5 folds the painting op into constructPath', () => {
	const path = [new Float32Array(13)];
	assert.equal(isVectorPaintOp(OPS, OPS.constructPath, [OPS.fill, path, new Float32Array(4)]), true);
	assert.equal(isVectorPaintOp(OPS, OPS.constructPath, [OPS.stroke, path, new Float32Array(4)]), true);
	// A path that is only ended (clip / no-op) paints nothing.
	assert.equal(isVectorPaintOp(OPS, OPS.constructPath, [OPS.endPath, path, new Float32Array(4)]), false);
});
