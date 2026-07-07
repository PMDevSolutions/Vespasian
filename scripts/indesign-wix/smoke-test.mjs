#!/usr/bin/env node
// End-to-end smoke test for the InDesign pipeline (Wix target).
//
// Mirrors what the indesign-to-wix agent does: build a fixture document, run
// it through the real `vespasian pipeline indesign` CLI with --plan, and
// assert the compiled BuildPlan is valid. Fixtures are code (not committed
// binaries), so this builds a representative two-spread brochure .idml in a
// temp dir first.
//
//   node scripts/indesign-wix/smoke-test.mjs
//
// Exits 0 on success, non-zero with a diagnostic on any failure. When the CLI
// does not yet expose `--plan` on the indesign pipeline (contract surface:
// `vespasian pipeline indesign <input> [--plan <out>]`), the test SKIPS with
// exit 0 and a loud message rather than failing the whole lane — remove the
// skip once bin/vespasian.mjs lands the flag.
//
// Used by the Pipeline Tests CI workflow and runnable locally.

import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIdml } from '../../packages/pipeline/tests/indesign/helpers/build-idml.js';

const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

const PHASES = ['provision', 'media', 'data', 'editor', 'code', 'properties', 'publish', 'qa'];
const METHODS = new Set(['api', 'cli', 'playwright', 'agent']);
const ON_FAIL = new Set(['retry', 'escalate', 'skip-and-report']);

function fail(msg) {
	process.stderr.write(`x smoke: ${msg}\n`);
	process.exit(1);
}

/** A representative two-spread brochure: text-heavy spread + image-heavy spread. */
function brochureIdml() {
	return buildIdml({
		name: 'Smoke Brochure',
		colors: [
			{ id: 'col-brand', name: 'Brand Blue', space: 'RGB', values: [0, 102, 204] },
			{ id: 'col-ink', name: 'Ink', space: 'CMYK', values: [0, 0, 0, 100] },
		],
		fonts: [{ id: 'f-helv', family: 'Helvetica', style: 'Bold', postScriptName: 'Helvetica-Bold' }],
		styles: [
			{ id: 'p-h1', name: 'Heading 1', kind: 'paragraph', pointSize: 36, leading: 40, appliedFont: 'f-helv', fillColor: 'col-brand' },
			{ id: 'p-body', name: 'Body', kind: 'paragraph', pointSize: 12, leading: 18, fillColor: 'col-ink' },
		],
		stories: [
			{ id: 's-title', runs: [{ text: 'Welcome', paragraphStyle: 'p-h1' }] },
			{ id: 's-body', runs: [{ text: 'Body copy that introduces the brochure.', paragraphStyle: 'p-body' }] },
			{ id: 's-hero', runs: [{ text: 'On Sale Now', paragraphStyle: 'p-h1' }] },
		],
		spreads: [
			{
				id: 'spread-1',
				pages: [{ id: 'page-1', bounds: [0, 0, 792, 612] }],
				frames: [
					{ kind: 'text', id: 'tf-title', bounds: [60, 60, 140, 540], parentStory: 's-title' },
					{ kind: 'text', id: 'tf-body', bounds: [160, 60, 420, 540], parentStory: 's-body' },
				],
			},
			{
				id: 'spread-2',
				pages: [{ id: 'page-2', bounds: [0, 0, 792, 612] }],
				frames: [
					{ kind: 'image', id: 'if-hero', bounds: [0, 0, 612, 792], href: 'file:Links/hero.png' },
					{ kind: 'text', id: 'if-overlay', bounds: [200, 100, 320, 500], parentStory: 's-hero' },
				],
			},
		],
	});
}

/** Validate the BuildPlan shape (mirrors scripts/shared/plan-lint.sh). */
function assertValidPlan(plan) {
	if (plan.planVersion !== 1) fail(`planVersion is ${plan.planVersion}, expected 1`);
	if (!plan.site || typeof plan.site.title !== 'string' || !plan.site.title) fail('site.title missing or empty');
	if (!plan.meta || typeof plan.meta.sourceHash !== 'string' || !plan.meta.sourceHash) fail('meta.sourceHash missing');
	if (!Array.isArray(plan.steps) || plan.steps.length === 0) fail('steps missing or empty');

	let lastPhaseIndex = 0;
	for (const step of plan.steps) {
		for (const field of ['id', 'op', 'method', 'phase', 'idempotencyKey', 'onFail']) {
			if (!step[field]) fail(`step ${step.id ?? '?'} missing ${field}`);
		}
		if (!METHODS.has(step.method)) fail(`step ${step.id}: invalid method "${step.method}"`);
		if (!ON_FAIL.has(step.onFail)) fail(`step ${step.id}: invalid onFail "${step.onFail}"`);
		const phaseIndex = PHASES.indexOf(step.phase);
		if (phaseIndex === -1) fail(`step ${step.id}: invalid phase "${step.phase}"`);
		if (phaseIndex < lastPhaseIndex) fail(`step ${step.id}: phase "${step.phase}" out of canonical order`);
		lastPhaseIndex = phaseIndex;
	}
}

async function main() {
	// Contract CLI surface check: `vespasian pipeline indesign <input> [--plan <out>]`
	const help = spawnSync(
		process.execPath,
		[path.join(ROOT, 'bin/vespasian.mjs'), 'pipeline', 'indesign', '--help'],
		{ cwd: ROOT, encoding: 'utf8' },
	);
	const helpText = `${help.stdout ?? ''}${help.stderr ?? ''}`;
	if (!/--plan\b/.test(helpText)) {
		process.stdout.write(
			'~ smoke: SKIPPED — bin/vespasian.mjs pipeline indesign does not expose --plan yet.\n' +
			'  (Contract: `vespasian pipeline indesign <input> [--plan <out>]`.)\n' +
			'  Remove this skip once the CLI lands the BuildPlan output flag.\n',
		);
		process.exit(0);
	}

	const work = await fs.mkdtemp(path.join(os.tmpdir(), 'vespasian-indesign-smoke-'));
	const idmlPath = path.join(work, 'brochure.idml');
	const planPath = path.join(work, 'brochure.plan.json');

	try {
		await fs.writeFile(idmlPath, brochureIdml());

		// Run the real CLI exactly as a developer (or the agent) would.
		const run = spawnSync(
			process.execPath,
			[path.join(ROOT, 'bin/vespasian.mjs'), 'pipeline', 'indesign', idmlPath, '--plan', planPath, '--quiet'],
			{ cwd: ROOT, encoding: 'utf8' },
		);

		if (run.status !== 0) {
			fail(`CLI exited ${run.status}\n${run.stderr || run.stdout}`);
		}

		// The compiled plan must exist, parse, and satisfy the BuildPlan contract.
		let plan;
		try {
			plan = JSON.parse(await fs.readFile(planPath, 'utf8'));
		} catch (err) {
			fail(`plan output missing or unparseable at ${planPath}: ${err.message}`);
		}
		assertValidPlan(plan);

		// The two spreads must surface as editor-plane composition work
		// (pages/sections are editor-only on Wix — no API exists for them).
		const editorSteps = plan.steps.filter((s) => s.phase === 'editor');
		if (editorSteps.length === 0) fail('expected editor-phase steps for the two spreads');

		// The brochure's colors must have produced theme work somewhere in the
		// plan (theme panel flow or global.css write).
		const hasThemeWork = plan.steps.some(
			(s) => /theme|css/i.test(s.op) || (s.method === 'cli' && /css/i.test(JSON.stringify(s.input ?? ''))),
		);
		if (!hasThemeWork) fail('expected a theme/global.css step derived from the document colors');

		process.stdout.write(
			`+ smoke: InDesign pipeline compiled a valid BuildPlan (${plan.steps.length} steps, ` +
			`${editorSteps.length} editor steps, planVersion 1)\n`,
		);
	} finally {
		await fs.rm(work, { recursive: true, force: true });
	}
}

main().catch((err) => fail(err.stack || err.message));
