// plan/: compiler determinism (two runs → byte-identical JSON) and a golden
// snapshot over the bundled fixture artifacts.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { compilePlan } from '../src/plan/compile.js';
import { BuildPlanSchema, PHASES } from '../src/plan/schema.js';
import { stableStringify } from '../src/plan/hash.js';

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

const artifacts = {
	ir: load('ir.json'),
	content: load('content.json'),
	tokens: load('tokens.json'),
	assets: load('assets.manifest.json'),
};
const options = { templateId: 'tpl-studio-1' };

test('compilePlan output validates against BuildPlanSchema', () => {
	const plan = compilePlan(artifacts, options);
	assert.doesNotThrow(() => BuildPlanSchema.parse(plan));
	assert.equal(plan.planVersion, 1);
	assert.equal(plan.site.title, 'Home');
	assert.equal(plan.site.templateId, 'tpl-studio-1');
});

test('two compiles of the same inputs are byte-identical (no timestamps, no randomness)', () => {
	const a = compilePlan(artifacts, options);
	const b = compilePlan(artifacts, options);
	assert.equal(JSON.stringify(a), JSON.stringify(b));
	assert.equal(a.meta.sourceHash, b.meta.sourceHash);
});

test('different inputs change the sourceHash', () => {
	const a = compilePlan(artifacts, options);
	const b = compilePlan({ ...artifacts, tokens: { ...artifacts.tokens, palette: [] } }, options);
	assert.notEqual(a.meta.sourceHash, b.meta.sourceHash);
});

test('steps are phase-ordered and channel-routed per the operations matrix', () => {
	const plan = compilePlan(artifacts, options);

	// Phase ordering follows the canonical sequence.
	const phaseIndexes = plan.steps.map((s) => PHASES.indexOf(s.phase));
	assert.deepEqual(phaseIndexes, [...phaseIndexes].sort((x, y) => x - y));

	// Provisioning asserts Studio.
	const assertStudio = plan.steps.find((s) => s.op === 'site.assertStudio');
	assert.deepEqual(assertStudio.verify, { assert: 'editorType', equals: 'WIX_STUDIO' });
	assert.equal(assertStudio.onFail, 'escalate');

	// Media upload is API with a file-ready verify.
	const upload = plan.steps.find((s) => s.id === 'media-upload-hero-image');
	assert.equal(upload.method, 'api');
	assert.deepEqual(upload.verify, { assert: 'file-ready' });

	// Theme panels are deterministic playwright; canvas composition is agent.
	assert.equal(plan.steps.find((s) => s.op === 'editor.applyThemeColors').method, 'playwright');
	const section = plan.steps.find((s) => s.op === 'editor.addSection');
	assert.equal(section.method, 'agent');
	assert.equal(section.onFail, 'escalate');

	// global.css goes through the CLI channel in the code phase (after editor).
	const css = plan.steps.find((s) => s.op === 'cli.writeGlobalCss');
	assert.equal(css.method, 'cli');
	assert.equal(css.phase, 'code');
	assert.ok(css.input.css.includes('--vsp-space-40'));

	// Publish is API; QA capture degrades gracefully.
	assert.equal(plan.steps.find((s) => s.op === 'site.publish').method, 'api');
	assert.equal(plan.steps.find((s) => s.op === 'qa.capture').onFail, 'skip-and-report');

	// Every step has a stable idempotency key.
	for (const step of plan.steps) {
		assert.match(step.idempotencyKey, /^[0-9a-f]{16}$/);
	}
});

test('content blocks map to agent editor steps with bounds + style hints', () => {
	const plan = compilePlan(artifacts, options);
	const image = plan.steps.find((s) => s.op === 'editor.addImage');
	assert.equal(image.input.assetSlug, 'hero-image');
	assert.deepEqual(image.input.bounds, { x: 0, y: 0, width: 1200, height: 600 });

	const text = plan.steps.find((s) => s.op === 'editor.addText');
	assert.equal(text.input.themeSlot, 'h1');

	// Second page is created in the editor (page 1 rides the template).
	const page2 = plan.steps.find((s) => s.op === 'editor.addPage');
	assert.equal(page2.input.name, 'Contact');

	// Per-page SEO is a playwright panel step.
	const seo = plan.steps.find((s) => s.op === 'editor.setPageSeo');
	assert.equal(seo.method, 'playwright');
	assert.equal(seo.input.title, 'Home — Fixture');
});

test('golden snapshot: fixture artifacts compile to the committed BuildPlan', () => {
	const plan = compilePlan(artifacts, options);
	const golden = load('golden-plan.json');
	assert.deepEqual(JSON.parse(JSON.stringify(plan)), golden);
});

test('stableStringify sorts object keys recursively', () => {
	assert.equal(stableStringify({ b: 1, a: { d: 2, c: 3 } }), '{"a":{"c":3,"d":2},"b":1}');
});
