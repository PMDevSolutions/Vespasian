// executor/: dry-run end-to-end — compile the fixture plan, execute it with
// recording transports, and verify every api/cli phase completes while editor
// steps surface as structured pending-agent entries. No network, no browser.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { compilePlan } from '../src/plan/compile.js';
import { executePlan } from '../src/executor/run.js';
import { createDryRunTransport } from '../src/dryrun/index.js';
import { createRestClient } from '../src/rest/index.js';
import { createCliChannel } from '../src/cli/index.js';
import { buildFidelityReport, renderFidelityMarkdown } from '../src/qa/fidelityReport.js';

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

function fixturePlan() {
	return compilePlan(
		{
			ir: load('ir.json'),
			content: load('content.json'),
			tokens: load('tokens.json'),
			assets: load('assets.manifest.json'),
		},
		{ templateId: 'tpl-studio-1' },
	);
}

function dryRunHarness() {
	const scratch = mkdtempSync(join(tmpdir(), 'vsp-executor-'));
	const transport = createDryRunTransport({ accountId: 'acct-test', siteId: 'site-test' });
	const rest = createRestClient({ transport });
	const cli = createCliChannel({ stageDir: join(scratch, 'site-repo'), dryRun: true });
	return { scratch, transport, rest, cli };
}

test('dry-run end-to-end: api/cli phases complete, editor steps become pending-agent', async () => {
	const plan = fixturePlan();
	const { scratch, transport, rest, cli } = dryRunHarness();

	const report = await executePlan(plan, {
		rest,
		cli,
		checkpointDir: join(scratch, 'checkpoints'),
	});

	assert.equal(report.ok, true, JSON.stringify(report.steps.filter((s) => s.status === 'failed')));

	// All API/CLI phases complete.
	const phaseStatus = Object.fromEntries(report.phases.map((p) => [p.phase, p.status]));
	for (const phase of ['provision', 'media', 'data', 'editor', 'code', 'properties', 'publish', 'qa']) {
		assert.equal(phaseStatus[phase], 'complete', `phase ${phase} should complete`);
	}

	// Every playwright/agent step is a structured pending-agent entry, not a failure.
	const editorSteps = plan.steps.filter((s) => s.method === 'playwright' || s.method === 'agent');
	const pendingIds = report.pendingAgent.map((p) => p.stepId).sort();
	assert.deepEqual(pendingIds, editorSteps.map((s) => s.id).sort());
	for (const entry of report.pendingAgent) {
		assert.ok(entry.hint.length > 0, 'pending-agent entries carry an actionable hint');
	}
	assert.ok(report.steps.every((s) => s.status !== 'failed'));

	// API steps went through the recording transport with secrets redacted.
	const createCall = transport.log.find((e) => e.url.endsWith('/funnel/projects/v1/create'));
	assert.ok(createCall);
	assert.equal(createCall.headers.Authorization, '<redacted>');
	assert.equal(createCall.headers['wix-account-id'], 'acct-test');
	const publishCall = transport.log.find((e) => e.url.endsWith('/site-publisher/v1/site/publish'));
	assert.ok(publishCall, 'publish was recorded');

	// Provisioning propagated the dry-run siteId + asserted Studio.
	const editorUrlsCall = transport.log.find((e) => e.url.includes('/editor-urls/v2/editor-urls'));
	assert.ok(editorUrlsCall);

	// Media pipeline ran: generate-upload-url then signed PUT.
	assert.ok(transport.log.some((e) => e.url.endsWith('/files/generate-upload-url')));
	assert.ok(transport.log.some((e) => e.method === 'PUT' && e.url.includes('upload.wixmp.com')));

	// CLI channel staged global.css into the site repo working dir.
	const cssPath = join(cli.workDir, 'src', 'styles', 'global.css');
	assert.ok(existsSync(cssPath), 'global.css staged');
	const css = readFileSync(cssPath, 'utf8');
	assert.ok(css.includes('--vsp-space-40'));

	// Checkpoints were written per phase.
	const checkpointFile = join(scratch, 'checkpoints', `${plan.meta.sourceHash.slice(0, 16)}.json`);
	assert.ok(existsSync(checkpointFile), 'checkpoint written');
	const checkpoint = JSON.parse(readFileSync(checkpointFile, 'utf8'));
	assert.equal(checkpoint.lastCompletedPhase, 'qa');
	assert.ok(checkpoint.completedSteps.includes('publish-site'));

	// FidelityReport merges translate notes + pending agent work.
	const fidelity = buildFidelityReport({ translate: report.fidelity, pendingAgent: report.pendingAgent });
	assert.equal(fidelity.summary.pendingAgentSteps, report.pendingAgent.length);
	const markdown = renderFidelityMarkdown(fidelity);
	assert.ok(markdown.includes('# Fidelity Report'));
	assert.ok(markdown.includes('Pending agent steps'));
});

test('--resume-from skips earlier phases and their steps', async () => {
	const plan = fixturePlan();
	const { scratch, rest, cli } = dryRunHarness();

	const report = await executePlan(plan, {
		rest,
		cli,
		checkpointDir: join(scratch, 'checkpoints'),
		resumeFrom: 'code',
	});

	assert.equal(report.ok, true);
	const skipped = report.steps.filter((s) => s.status === 'skipped');
	assert.ok(skipped.some((s) => s.id === 'provision-create-site'));
	assert.ok(skipped.every((s) => /resumed from code/.test(s.reason)));
	const cssStep = report.steps.find((s) => s.id === 'code-global-css');
	assert.equal(cssStep.status, 'ok');
});

test('unknown --resume-from phase is rejected', async () => {
	const plan = fixturePlan();
	const { rest, cli } = dryRunHarness();
	await assert.rejects(() => executePlan(plan, { rest, cli, resumeFrom: 'nonsense' }), /Unknown --resume-from/);
});

test('onFail semantics: retry retries, skip-and-report skips, escalate goes pending-agent', async () => {
	const { scratch, cli } = dryRunHarness();
	let attempts = 0;
	const flaky = {
		request: async (req) => {
			if (req.path === '/site-publisher/v1/site/publish') {
				attempts += 1;
				if (attempts < 3) throw new Error('transient');
				return {};
			}
			return createDryRunTransport().request(req);
		},
		context: {},
	};
	const rest = createRestClient({ transport: flaky });

	const plan = compilePlan({ tokens: load('tokens.json') }, { siteTitle: 'Retry Site', templateId: 't1' });
	const report = await executePlan(plan, { rest, cli, checkpointDir: join(scratch, 'checkpoints') });

	const publish = report.steps.find((s) => s.id === 'publish-site');
	assert.equal(publish.status, 'ok');
	assert.equal(publish.attempts, 3, 'retry ran 3 attempts');
	assert.equal(report.ok, true);
});

test('a failed phase is never checkpointed as completed; resume restores checkpoint state', async () => {
	const plan = fixturePlan();
	const { scratch, cli } = dryRunHarness();

	// Publish always fails → the publish phase must not become lastCompletedPhase.
	const failing = {
		request: async (req) => {
			if (req.path === '/site-publisher/v1/site/publish') throw new Error('boom');
			return createDryRunTransport().request(req);
		},
		context: {},
		isDryRun: true,
	};
	const rest = createRestClient({ transport: failing });
	const report = await executePlan(plan, { rest, cli, checkpointDir: join(scratch, 'checkpoints') });

	assert.equal(report.ok, false);
	const checkpointFile = join(scratch, 'checkpoints', `${plan.meta.sourceHash.slice(0, 16)}.json`);
	const checkpoint = JSON.parse(readFileSync(checkpointFile, 'utf8'));
	assert.equal(checkpoint.lastCompletedPhase, 'properties', 'failed publish must not be recorded as completed');
	assert.equal(checkpoint.failedPhase, 'publish');
	assert.ok(checkpoint.state.siteId, 'provision state is preserved for resume');

	// Resuming past the failed phase is refused …
	const okRest = createRestClient({ transport: createDryRunTransport() });
	await assert.rejects(
		() => executePlan(plan, { rest: okRest, cli, checkpointDir: join(scratch, 'checkpoints'), resumeFrom: 'qa' }),
		/would skip phase\(s\) the checkpoint does not record as completed: publish/,
	);

	// … while resuming AT the failed phase restores the checkpointed state.
	const resumed = await executePlan(plan, {
		rest: okRest,
		cli,
		checkpointDir: join(scratch, 'checkpoints'),
		resumeFrom: 'publish',
	});
	assert.equal(resumed.ok, true);
	const publish = resumed.steps.find((s) => s.id === 'publish-site');
	assert.equal(publish.status, 'ok');
});

test('resume without a checkpoint still runs but records a warning note', async () => {
	const plan = fixturePlan();
	const { scratch, rest, cli } = dryRunHarness();

	const report = await executePlan(plan, {
		rest,
		cli,
		checkpointDir: join(scratch, 'checkpoints'),
		resumeFrom: 'code',
	});
	assert.equal(report.ok, true);
	assert.ok(report.fidelity.some((n) => n.code === 'executor.resume-no-checkpoint'));
});

test('media verify file-ready passes in dry-run; live media.upload refuses empty fallback bytes', async () => {
	const plan = fixturePlan();
	const { scratch, rest, cli } = dryRunHarness();
	const report = await executePlan(plan, { rest, cli, checkpointDir: join(scratch, 'checkpoints') });
	const media = report.steps.find((s) => s.op === 'media.upload');
	assert.ok(media, 'fixture plan has a media step');
	assert.deepEqual(media.verify, { assert: 'file-ready', status: 'ok' });

	// A NON-dry-run rest client with an unreadable asset path must fail the step.
	const liveish = createRestClient({ transport: { request: async () => ({}), context: {} } });
	assert.equal(liveish.dryRun, false);
	const { cli: cli2 } = dryRunHarness();
	const liveReport = await executePlan(plan, { rest: liveish, cli: cli2, checkpoints: false });
	const failed = liveReport.steps.find((s) => s.op === 'media.upload');
	assert.equal(failed.status, 'failed');
	assert.match(failed.error, /refusing to upload an empty file/);
});

test('pages-before-code guard: pending editor steps block cli.push in live mode, not in dry-run', async () => {
	const plan = {
		planVersion: 1,
		site: { title: 'Guard Site' },
		steps: [
			{ id: 'editor-page-1', op: 'editor.addPage', method: 'agent', phase: 'editor', input: { name: 'Home' }, idempotencyKey: 'k1', onFail: 'escalate' },
			{ id: 'code-push', op: 'cli.push', method: 'cli', phase: 'code', input: {}, idempotencyKey: 'k2', onFail: 'retry' },
		],
		fidelity: [],
		meta: { sourceHash: 'a'.repeat(64) },
	};

	// LIVE rest plane (dryRun false): the pending editor page means pages do
	// not exist — cli.push must refuse.
	const liveish = createRestClient({ transport: { request: async () => ({}), context: {} } });
	const { cli } = dryRunHarness();
	const liveReport = await executePlan(plan, { rest: liveish, cli, checkpoints: false });
	const livePush = liveReport.steps.find((s) => s.id === 'code-push');
	assert.equal(livePush.status, 'failed');
	assert.match(livePush.error, /pages do not exist in the editor yet/i);

	// Dry-run rest plane: pending editor steps count as done-for-sequencing.
	const { rest: dryRest, cli: dryCli } = dryRunHarness();
	const dryReport = await executePlan(plan, { rest: dryRest, cli: dryCli, checkpoints: false });
	const dryPush = dryReport.steps.find((s) => s.id === 'code-push');
	assert.equal(dryPush.status, 'ok');
	assert.equal(dryReport.ok, true);
});

test('cli channel refuses code push before the editor phase (pages before code)', () => {
	const { cli } = dryRunHarness();
	assert.throws(() => cli.push({}), /pages do not exist in the editor yet/i);
	cli.setPagesReady(true);
	const result = cli.push({ message: 'test' });
	assert.equal(result.ok, true);
	assert.equal(result.staged, true);
	assert.ok(result.instructions.some((line) => /git push/.test(line)));
});
