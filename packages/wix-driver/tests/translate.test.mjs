// translate/: palette compression (incl. >25 colors), 9-slot ramp + overflow,
// spacing CSS emission, font matching, global.css assembly.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { translateTokens } from '../src/translate/index.js';
import { translatePalette, normalizeHex, MAX_SITE_COLORS, ROLE_ORDER } from '../src/translate/palette.js';
import { translateTypography, sizeToPx, TEXT_SLOTS } from '../src/translate/typography.js';
import { translateFonts } from '../src/translate/fonts.js';
import { translateSpacing } from '../src/translate/spacing.js';
import { normalizeTokens } from '../src/translate/schemas.js';

const tokens = JSON.parse(readFileSync(new URL('./fixtures/tokens.json', import.meta.url), 'utf8'));

test('normalizeHex expands short hex and uppercases', () => {
	assert.equal(normalizeHex('#abc'), '#AABBCC');
	assert.equal(normalizeHex('1a2b3c'), '#1A2B3C');
	assert.equal(normalizeHex('linear-gradient(red, blue)'), null);
});

test('palette: all six Studio roles are assigned with explicit hex values', () => {
	const { colors, fidelity } = translatePalette(tokens.palette);
	for (const role of ROLE_ORDER) {
		assert.ok(colors.roles[role], `role ${role} missing`);
		assert.match(colors.roles[role].value, /^#[0-9A-F]{6}$/);
	}
	// Lightest → primary background, darkest → primary text.
	assert.equal(colors.roles['primary-background'].slug, 'paper');
	assert.equal(colors.roles['primary-text'].slug, 'ink');
	// Most saturated → links/actions.
	assert.equal(colors.roles['links-actions'].slug, 'coral');
	// 5 input colors + synthesized disabled — no truncation at this size.
	assert.deepEqual(colors.truncated, []);
	assert.ok(fidelity.every((n) => n.code !== 'palette.truncated'));
});

test('palette: >25 colors are compressed to 25 site colors with a truncation note', () => {
	const big = Array.from({ length: 30 }, (_, i) => ({
		slug: `c${String(i).padStart(2, '0')}`,
		color: `#${(i * 8).toString(16).padStart(2, '0').repeat(3)}`,
		name: `Color ${i}`,
	}));
	const { colors, fidelity } = translatePalette(big);
	assert.equal(colors.siteColors.length, MAX_SITE_COLORS);
	assert.equal(colors.truncated.length, 5);
	const truncationNote = fidelity.find((n) => n.code === 'palette.truncated');
	assert.ok(truncationNote, 'expected a palette.truncated fidelity note');
	assert.equal(truncationNote.severity, 'warn');
	assert.deepEqual(truncationNote.context.dropped, colors.truncated);
});

test('palette: unparseable colors are skipped with a note, not crashed on', () => {
	const { colors, fidelity } = translatePalette([
		{ slug: 'grad', color: 'linear-gradient(#fff, #000)' },
		{ slug: 'ok', color: '#123456' },
	]);
	assert.ok(fidelity.some((n) => n.code === 'palette.unparseable-color'));
	assert.ok(colors.siteColors.every((c) => c.slug !== 'grad'));
});

test('typography: sizes rank into H1–H6 then P1–P3; overflow spills to .vsp-text-* classes', () => {
	const twelve = Array.from({ length: 12 }, (_, i) => ({
		slug: `s${String(i).padStart(2, '0')}`,
		size: `${64 - i * 4}px`,
	}));
	const { typography, fidelity } = translateTypography(twelve);

	assert.deepEqual(Object.keys(typography.slots), TEXT_SLOTS);
	assert.equal(typography.slots.h1.fontSize, '64px'); // largest → H1
	assert.equal(typography.slots.p3.fontSize, '32px'); // 9th largest → P3
	assert.equal(typography.overflow.length, 3);
	assert.equal(typography.overflow[0].className, 'vsp-text-s09');
	const note = fidelity.find((n) => n.code === 'typography.overflow');
	assert.ok(note && note.severity === 'warn');
});

test('typography: fewer than 9 sizes leaves the remaining slots unset with an info note', () => {
	const { typography, fidelity } = translateTypography(tokens.fontSizes);
	assert.equal(Object.keys(typography.slots).length, 6);
	assert.equal(typography.slots.h1.fontSize, '56px');
	assert.equal(typography.overflow.length, 0);
	assert.ok(fidelity.some((n) => n.code === 'typography.partial-ramp'));
});

test('sizeToPx handles px, rem, pt, numbers, and clamp() expressions', () => {
	assert.deepEqual(sizeToPx('18px'), { px: 18, exact: true });
	assert.deepEqual(sizeToPx('1.5rem'), { px: 24, exact: true });
	assert.deepEqual(sizeToPx(20), { px: 20, exact: true });
	assert.equal(sizeToPx('12pt').px, 16);
	assert.equal(sizeToPx('clamp(1rem, 2vw, 2rem)').exact, false);
});

test('fonts: builtin families match; unknown families get a WOFF2 upload plan', () => {
	const { fonts, fidelity } = translateFonts(tokens.fontFamilies);
	const heading = fonts.find((f) => f.slug === 'heading');
	assert.equal(heading.match.type, 'builtin');
	assert.equal(heading.match.name, 'Playfair Display');
	assert.equal(heading.match.bestEffort, true);

	const body = fonts.find((f) => f.slug === 'body');
	assert.equal(body.match.type, 'upload');
	assert.equal(body.match.plan.preferredFormat, 'woff2');
	assert.equal(body.match.plan.maxBytes, 4 * 1024 * 1024);
	assert.ok(body.match.plan.fileHints[0].endsWith('.woff2'));
	assert.ok(fidelity.some((n) => n.code === 'fonts.upload-required'));
});

test('spacing: emits :root --vsp-space-* vars plus .vsp-p-*/.vsp-m-* utilities', () => {
	const { spacing, css, fidelity } = translateSpacing(tokens.spacingSizes);
	assert.equal(spacing.vars.length, 4);
	assert.ok(css.includes(':root {'));
	assert.ok(css.includes('--vsp-space-40: 2rem;'));
	assert.ok(css.includes('.vsp-p-40 { padding: var(--vsp-space-40); }'));
	assert.ok(css.includes('.vsp-m-80 { margin: var(--vsp-space-80); }'));
	assert.ok(fidelity.some((n) => n.code === 'spacing.css-only'));
});

test('spacing: pipeline-style slugs (space-40, id-space-40) never double the space prefix', () => {
	const { spacing, css } = translateSpacing([
		{ slug: 'space-40', size: '2rem' },
		{ slug: 'id-space-40', size: '2.5rem' },
	]);
	assert.deepEqual(
		spacing.vars.map((v) => v.name),
		['--vsp-space-40', '--vsp-id-space-40'],
	);
	assert.ok(!css.includes('--vsp-space-space-'));
	assert.ok(!css.includes('--vsp-space-id-'));
});

test('fonts: CSS generic/system keyword stacks get a system match, not an impossible upload plan', () => {
	const { fonts, fidelity } = translateFonts([
		{ slug: 'sans', fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" },
		{ slug: 'mono', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
	]);
	for (const font of fonts) {
		assert.equal(font.match.type, 'system', `${font.slug} must not get an upload plan`);
	}
	assert.ok(fidelity.every((n) => n.code !== 'fonts.upload-required'));
});

test('typography: document-derived families (tokens provenance) win the theme slots over base stacks', () => {
	// mapTokens output shape: base placeholder families merged FIRST, the
	// document's own family after, with provenance recording the derived slug.
	const pipelineTokens = {
		palette: [],
		fontSizes: [{ slug: 'id-32', size: '32px' }, { slug: 'id-16', size: '16px' }],
		fontFamilies: [
			{ slug: 'sans', name: 'Sans', fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif" },
			{ slug: 'serif', name: 'Serif', fontFamily: "Georgia, 'Times New Roman', serif" },
			{ slug: 'id-helvetica-neue', name: 'Helvetica Neue', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
		],
		spacingSizes: [],
		report: { provenance: { fontToSlug: { 'font-1': 'id-helvetica-neue' } } },
	};
	const { themePlan } = translateTokens(pipelineTokens);
	assert.equal(themePlan.typography.slots.h1.fontFamily, 'Helvetica Neue');
	assert.equal(themePlan.typography.slots.h2.fontFamily, 'Helvetica Neue');
});

test('translateTokens: full pipeline — ThemePlan + deterministic global.css + fidelity notes', () => {
	const first = translateTokens(tokens);
	const second = translateTokens(tokens);
	assert.equal(first.globalCss, second.globalCss, 'global.css must be deterministic');

	assert.ok(first.globalCss.startsWith('/*'));
	assert.ok(first.globalCss.includes('generated by @vespasian/wix-driver'));
	assert.ok(first.globalCss.includes('--vsp-color-coral: #FF6B6B;'));
	assert.ok(first.globalCss.includes('--vsp-space-10: 0.5rem;'));
	// No literal timestamps.
	assert.ok(!/\d{4}-\d{2}-\d{2}/.test(first.globalCss));

	assert.equal(first.themePlan.colors.siteColors.length, 5);
	assert.equal(first.themePlan.fonts.length, 2);
	assert.ok(Array.isArray(first.fidelity) && first.fidelity.length > 0);
});

test('normalizeTokens accepts a theme.json-style settings wrapper', () => {
	const wrapped = {
		settings: {
			color: { palette: tokens.palette },
			typography: { fontSizes: tokens.fontSizes, fontFamilies: tokens.fontFamilies },
			spacing: { spacingSizes: tokens.spacingSizes },
		},
	};
	const normalized = normalizeTokens(wrapped);
	assert.equal(normalized.palette.length, 5);
	assert.equal(normalized.fontSizes.length, 6);
	assert.equal(normalized.spacingSizes.length, 4);
});
