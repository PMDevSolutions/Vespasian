// Canva-to-Wix pipeline — integration test.
//
// Part A (always runs): exercises the deterministic helper scripts the
//   canva-wix-converter agent path relies on, against the committed fixture
//   and its goldens (tokens + content blocks).
// Part B (runs when packages/wix-driver is present, i.e. always in this
//   repo): fixture tokens + content → BuildPlan compile → dry-run apply with
//   recording transports. Zero Wix credentials, zero network — editor steps
//   surface as structured pending-agent entries, exactly like CI dry-run mode.
// Part C (skips until bin/vespasian.mjs lands the subcommands): asserts the
//   contract CLI surface (`plan`, `apply`, `publish`, `qa`) is advertised.
//
// See tests/fixtures/canva/landing/README.md for why goldens stand in for the
// LLM agent's output.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	FIXTURE_DIR,
	runScript,
	driverAvailable,
	importDriver,
	cliSupports,
	blocksToContentModel,
} from './lib.mjs';

const CSS = `${FIXTURE_DIR}/style.css`;
const HTML = `${FIXTURE_DIR}/index.html`;
const GOLDEN_TOKENS = JSON.parse(readFileSync(`${FIXTURE_DIR}/expected-tokens.json`, 'utf8'));
const GOLDEN_BLOCKS = JSON.parse(readFileSync(`${FIXTURE_DIR}/expected-blocks.json`, 'utf8'));

// ---------------------------------------------------------------------------
// Part A — deterministic helper scripts (no credentials required)
// ---------------------------------------------------------------------------

describe('canva-wix helper scripts (deterministic agent-path pieces)', () => {
	test('parse-canva-export.sh extracts a complete token set from the fixture CSS', () => {
		const json = runScript('scripts/canva-wix/parse-canva-export.sh', ['--tokens', CSS]);
		const tokens = JSON.parse(json); // throws if the script emits invalid JSON

		assert.ok(tokens.palette.length >= 3, 'expected colors (hex + rgb) extracted');
		assert.ok(tokens.fontFamilies.length >= 2, 'expected font families extracted');
		assert.ok(tokens.fontSizes.length >= 3, 'expected font sizes extracted');
		assert.ok(tokens.spacingSizes.length >= 3, 'expected spacing tokens extracted');
	});

	test('parse-canva-export.sh output matches the committed golden', () => {
		const json = runScript('scripts/canva-wix/parse-canva-export.sh', ['--tokens', CSS]);
		assert.deepEqual(JSON.parse(json), GOLDEN_TOKENS);
	});

	test('convert-html-to-wix.sh produces balanced, expected content blocks', () => {
		const doc = JSON.parse(runScript('scripts/canva-wix/convert-html-to-wix.sh', [HTML]));

		assert.equal(doc.version, 1);
		assert.equal(doc.source, 'canva');

		const types = new Set(doc.blocks.map((b) => b.type));
		for (const type of ['heading', 'paragraph', 'image', 'button', 'list']) {
			assert.ok(types.has(type), `expected a ${type} block`);
		}

		const starts = doc.blocks.filter((b) => b.type === 'section' && b.boundary === 'start').length;
		const ends = doc.blocks.filter((b) => b.type === 'section' && b.boundary === 'end').length;
		assert.ok(starts > 0, 'expected at least one section');
		assert.equal(starts, ends, 'section start/end markers must balance');
	});

	test('convert-html-to-wix.sh output matches the committed golden', () => {
		const doc = JSON.parse(runScript('scripts/canva-wix/convert-html-to-wix.sh', [HTML]));
		assert.deepEqual(doc, GOLDEN_BLOCKS);
	});
});

// ---------------------------------------------------------------------------
// Part B — tokens + content → BuildPlan compile → dry-run apply
// ---------------------------------------------------------------------------

describe('fixture tokens compile into a BuildPlan and dry-run apply cleanly', {
	skip: driverAvailable() ? false : 'packages/wix-driver not present in this checkout',
}, () => {
	test('compile + dry-run apply (recording transports, no network)', async () => {
		const driver = await importDriver();
		const { compilePlan, executePlan, createRestClient, createDryRunTransport, createCliChannel, PHASES } = driver;

		// Real script outputs, not the goldens — this is the live chain.
		const tokens = JSON.parse(runScript('scripts/canva-wix/parse-canva-export.sh', ['--tokens', CSS]));
		const blockDoc = JSON.parse(runScript('scripts/canva-wix/convert-html-to-wix.sh', [HTML]));
		const content = blocksToContentModel(blockDoc, 'Landing');

		const plan = compilePlan({ ir: {}, content, tokens }, { siteTitle: 'Canva Fixture' });

		assert.equal(plan.planVersion, 1);
		assert.ok(plan.steps.length > 0, 'plan has steps');
		assert.equal(plan.site.title, 'Canva Fixture');

		// Phase ordering is canonical (mirrors scripts/shared/plan-lint.sh)
		let last = 0;
		for (const step of plan.steps) {
			const idx = PHASES.indexOf(step.phase);
			assert.ok(idx >= 0, `valid phase for ${step.id}`);
			assert.ok(idx >= last, `phase order non-decreasing at ${step.id}`);
			last = idx;
		}

		// The fixture content must surface editor-plane work (pages/canvas are
		// editor-only on Wix) and the palette must surface theme/css work.
		assert.ok(plan.steps.some((s) => s.phase === 'editor'), 'expected editor-phase steps');
		assert.ok(
			plan.steps.some((s) => s.method === 'cli' || /theme/i.test(s.op)),
			'expected theme/global.css work derived from the tokens',
		);

		// Dry-run apply: recording REST transport + staging CLI channel, no editor
		// driver attached — playwright/agent steps become pending-agent entries.
		const scratch = mkdtempSync(join(tmpdir(), 'vespasian-canva-e2e-'));
		const rest = createRestClient({ transport: createDryRunTransport({ accountId: 'acct-test', siteId: 'site-test' }) });
		const cli = createCliChannel({ stageDir: join(scratch, 'site-repo'), dryRun: true });

		const report = await executePlan(plan, { rest, cli, checkpoints: false });

		assert.equal(report.ok, true, `dry-run apply must succeed:\n${JSON.stringify(report.steps, null, 2)}`);
		assert.ok(
			report.steps.every((s) => s.status !== 'failed'),
			'no step may hard-fail in dry-run',
		);
		const editorSteps = plan.steps.filter((s) => s.method === 'playwright' || s.method === 'agent');
		if (editorSteps.length > 0) {
			assert.ok(report.pendingAgent.length > 0, 'editor steps surface as pending-agent, not failures');
		}
	});
});

// ---------------------------------------------------------------------------
// Part C — contract CLI surface (skips until bin/vespasian.mjs lands it)
// ---------------------------------------------------------------------------

const cliHasPlan = cliSupports('plan');
const cliHasApply = cliSupports('apply');

describe('vespasian CLI exposes the contract surface', {
	skip: (cliHasPlan && cliHasApply)
		? false
		: 'bin/vespasian.mjs does not expose plan/apply yet (contract: vespasian plan <ir> · vespasian apply <plan> [--dry-run]) — un-skips automatically once the CLI lands them',
}, () => {
	test('plan / apply / publish / qa are advertised in --help', () => {
		for (const sub of ['plan', 'apply', 'publish', 'qa']) {
			assert.ok(cliSupports(sub), `expected \`vespasian ${sub}\` in --help output`);
		}
	});
});
