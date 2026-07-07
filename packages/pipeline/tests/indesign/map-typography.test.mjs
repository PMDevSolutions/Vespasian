// Paragraph styles → neutral font-size scale + the shared name → role classifier.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapTypography, classifyStyleRole } from '../../src/indesign/map/typography.js';

const baseFontSizes = [
	{ slug: 'base', size: '1rem' }, // 16px
	{ slug: 'display', size: 'clamp(2.25rem, 5vw, 3.5rem)' }, // 56px max
];

test('clusters near-equal sizes and references every emitted entry by a style', () => {
	const styles = [
		{ id: 'p1', name: 'Body', kind: 'paragraph', fontSize: 16 },
		{ id: 'p2', name: 'Body Alt', kind: 'paragraph', fontSize: 16.4 },
		{ id: 'p3', name: 'Title', kind: 'paragraph', fontSize: 56 },
	];
	const { fontSizes, styleToSlug } = mapTypography(styles, { baseFontSizes, tolerancePx: 1 });
	// 16 / 16.4 reuse base 'base'; 56 reuses base 'display' → no new entries.
	assert.equal(styleToSlug.p1, 'base');
	assert.equal(styleToSlug.p2, 'base');
	assert.equal(styleToSlug.p3, 'display');
	for (const entry of fontSizes) {
		assert.ok(Object.values(styleToSlug).includes(entry.slug), `entry ${entry.slug} must be referenced`);
	}
});

test('creates a derived, namespaced slug for a size with no base match', () => {
	const styles = [{ id: 'p1', name: 'Lead', kind: 'paragraph', fontSize: 21 }];
	const { fontSizes, styleToSlug } = mapTypography(styles, { baseFontSizes, tolerancePx: 1, namespace: 'id' });
	assert.equal(fontSizes.length, 1);
	assert.equal(styleToSlug.p1, fontSizes[0].slug);
	assert.equal(fontSizes[0].slug, 'id-lead');
	assert.equal(fontSizes[0].size, '1.3125rem'); // 21/16
	assert.equal(fontSizes[0].name, 'Lead');
});

test('emits fluid clamp() sizes above the threshold when asked', () => {
	const styles = [
		{ id: 'p1', name: 'Hero', kind: 'paragraph', fontSize: 64 },
		{ id: 'p2', name: 'Fine Print', kind: 'paragraph', fontSize: 12 },
	];
	const { fontSizes, styleToSlug } = mapTypography(styles, { baseFontSizes: [], fluid: true });
	const hero = fontSizes.find((f) => f.slug === styleToSlug.p1);
	assert.match(hero.size, /^clamp\(/);
	const fine = fontSizes.find((f) => f.slug === styleToSlug.p2);
	assert.equal(fine.size, '0.75rem'); // below the fluid threshold stays fixed
});

test('classifyStyleRole is the single name → role source of truth', () => {
	assert.deepEqual(classifyStyleRole('Heading 1'), { role: 'heading', level: 1 });
	assert.deepEqual(classifyStyleRole('h3'), { role: 'heading', level: 3 });
	assert.deepEqual(classifyStyleRole('HEADING 6'), { role: 'heading', level: 6 });
	assert.deepEqual(classifyStyleRole('Body'), { role: 'body' });
	assert.deepEqual(classifyStyleRole('Normal Text'), { role: 'body' });
	assert.deepEqual(classifyStyleRole('Caption'), { role: 'caption' });
	assert.deepEqual(classifyStyleRole('Footnote'), { role: 'caption' });
	assert.deepEqual(classifyStyleRole('Pull Quote'), { role: 'generic' });
	assert.deepEqual(classifyStyleRole(undefined), { role: 'generic' });
});
