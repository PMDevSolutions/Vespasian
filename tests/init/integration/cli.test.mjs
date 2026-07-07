// End-to-end smoke of bin/vespasian.mjs: pipeline → plan → dry-run apply,
// entirely offline (VESPASIAN_DRY_RUN / recording transports, no browser).
// Also carries the '-' stdin-sentinel coverage for `pipeline indesign`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BIN = join(REPO_ROOT, 'bin/vespasian.mjs');
const IR_FIXTURE = join(REPO_ROOT, 'tests/fixtures/minimal/ir.json');
const ASSET_DIR = join(REPO_ROOT, 'tests/fixtures/minimal/assets');

async function tmpProject() {
  return mkdtemp(join(tmpdir(), 'vespasian-cli-'));
}

test('--help exits 0 and shows the full command surface', async () => {
  const { stderr } = await exec('node', [BIN, '--help']);
  for (const cmd of ['init', 'login --editor', 'site create|use|list', 'pipeline indesign', 'plan', 'apply', 'publish', 'qa']) {
    assert.ok(stderr.includes(cmd), `missing "${cmd}" in root help`);
  }
});

test('no arguments exits 2', async () => {
  await assert.rejects(() => exec('node', [BIN]), { code: 2 });
});

test('unknown command exits 2', async () => {
  await assert.rejects(() => exec('node', [BIN, 'frobnicate']), { code: 2 });
});

test('pipeline --help exits 0; figma/canva point at the Claude-Code flows', async () => {
  const { stderr } = await exec('node', [BIN, 'pipeline', '--help']);
  assert.match(stderr, /indesign/);
  await assert.rejects(
    () => exec('node', [BIN, 'pipeline', 'figma', 'x']),
    (err) => err.code === 2 && /Claude-Code-driven/.test(err.stderr)
  );
});

test('pipeline indesign → artifacts + plan; plan recompiles byte-identically; apply --dry-run succeeds', async (t) => {
  const dir = await tmpProject();
  t.after(() => rm(dir, { recursive: true, force: true }));

  // 1. pipeline: IR fixture → artifact dir + BuildPlan
  const run = await exec('node', [BIN, 'pipeline', 'indesign', IR_FIXTURE,
    '--slug', 'smoke', '--asset-dir', ASSET_DIR], { cwd: dir });
  assert.match(run.stderr, /steps: \d+ total/);

  const planDir = join(dir, '.vespasian/plans/smoke');
  for (const artifact of ['ir.json', 'content.json', 'tokens.json', 'assets.manifest.json', 'plan.json', 'plan-report.md']) {
    await access(join(planDir, artifact), constants.F_OK);
  }
  await access(join(planDir, 'assets/spread-1-image-1.jpg'), constants.F_OK);

  const plan = JSON.parse(await readFile(join(planDir, 'plan.json'), 'utf8'));
  assert.equal(plan.planVersion, 1);
  assert.equal(plan.site.title, 'Minimal Brochure');
  assert.ok(Array.isArray(plan.steps) && plan.steps.length > 0);
  assert.ok(plan.steps.some(s => s.op === 'media.upload'), 'resolved asset becomes a media step');
  assert.ok(plan.steps.some(s => s.method === 'agent'), 'canvas work routed to the agent channel');

  const tokens = JSON.parse(await readFile(join(planDir, 'tokens.json'), 'utf8'));
  assert.deepEqual(
    Object.keys(tokens).sort(),
    ['designTokens', 'fontFamilies', 'fontSizes', 'palette', 'report', 'spacingSizes'],
  );

  // 2. plan: recompiling from the artifact dir is deterministic
  await exec('node', [BIN, 'plan', '.vespasian/plans/smoke', '--out', 'replan.json'], { cwd: dir });
  const a = await readFile(join(planDir, 'plan.json'), 'utf8');
  const b = await readFile(join(dir, 'replan.json'), 'utf8');
  assert.equal(a, b, 'plan compile must be byte-identical for identical artifacts');

  // 3. apply --dry-run: every api/cli phase completes; editor steps pend
  const apply = await exec('node', [BIN, 'apply', '.vespasian/plans/smoke/plan.json', '--dry-run'], { cwd: dir });
  assert.match(apply.stderr, /ok {6}provision/);
  assert.match(apply.stderr, /wix-site-builder/);

  const report = JSON.parse(await readFile(join(planDir, 'apply-report.json'), 'utf8'));
  assert.equal(report.ok, true);
  assert.ok(report.pendingAgent.length > 0, 'editor steps surface as pending-agent');
  assert.ok(report.steps.every(s => s.status !== 'failed'));
  await access(join(planDir, 'fidelity-report.md'), constants.F_OK);
  await access(join(dir, '.vespasian/checkpoints'), constants.F_OK);

  // 4. resume-from skips earlier phases
  const resumed = await exec('node', [BIN, 'apply', '.vespasian/plans/smoke/plan.json',
    '--dry-run', '--resume-from', 'publish'], { cwd: dir });
  assert.match(resumed.stderr, /skipped provision/);
});

test('pipeline indesign reads the - stdin sentinel', async (t) => {
  const dir = await tmpProject();
  t.after(() => rm(dir, { recursive: true, force: true }));

  const irText = await readFile(IR_FIXTURE, 'utf8');
  const child = spawn('node', [BIN, 'pipeline', 'indesign', '-', '--slug', 'stdin-smoke', '--quiet'], { cwd: dir });
  child.stdin.write(irText);
  child.stdin.end();
  const code = await new Promise((resolve) => child.on('exit', resolve));
  assert.equal(code, 0);
  await access(join(dir, '.vespasian/plans/stdin-smoke/plan.json'), constants.F_OK);
});

test('apply without credentials and without --dry-run is refused with guidance', async (t) => {
  const dir = await tmpProject();
  t.after(() => rm(dir, { recursive: true, force: true }));

  await exec('node', [BIN, 'pipeline', 'indesign', IR_FIXTURE, '--slug', 'refuse', '--quiet'], { cwd: dir });
  await assert.rejects(
    () => exec('node', [BIN, 'apply', '.vespasian/plans/refuse/plan.json'],
      { cwd: dir, env: { ...process.env, WIX_API_KEY: '', VESPASIAN_DRY_RUN: '' } }),
    (err) => err.code === 2 && /WIX_API_KEY/.test(err.stderr) && /--dry-run/.test(err.stderr)
  );
});

test('site list / publish / qa / login all honor VESPASIAN_DRY_RUN=1', async (t) => {
  const dir = await tmpProject();
  t.after(() => rm(dir, { recursive: true, force: true }));
  const env = { ...process.env, VESPASIAN_DRY_RUN: '1' };

  const list = await exec('node', [BIN, 'site', 'list'], { cwd: dir, env });
  assert.match(list.stderr, /dry-run/);

  const publish = await exec('node', [BIN, 'publish'], { cwd: dir, env });
  assert.match(publish.stderr, /dry-run: would publish/);

  const qa = await exec('node', [BIN, 'qa'], { cwd: dir, env });
  assert.match(qa.stderr, /would capture/);

  const login = await exec('node', [BIN, 'login', '--editor'], { cwd: dir, env });
  assert.match(login.stderr, /No consent recorded, no browser launched/);
});

test('site use records WIX_SITE_ID in .env', async (t) => {
  const dir = await tmpProject();
  t.after(() => rm(dir, { recursive: true, force: true }));

  await exec('node', [BIN, 'site', 'use', 'aaaa-bbbb'],
    { cwd: dir, env: { ...process.env, WIX_API_KEY: '', VESPASIAN_DRY_RUN: '' } });
  const env = await readFile(join(dir, '.env'), 'utf8');
  assert.match(env, /^WIX_SITE_ID=aaaa-bbbb$/m);
});
