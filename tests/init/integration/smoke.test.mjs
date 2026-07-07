import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, access, readFile, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// The wizard never hits the network in tests: no credentials are passed, or
// VESPASIAN_DRY_RUN=1 is set, so the site step records next-steps instead.
const ENV = { ...process.env, VESPASIAN_DRY_RUN: '' };

async function stageFixture() {
  const dir = await mkdtemp(join(tmpdir(), 'init-smoke-'));
  for (const item of ['.env.example', 'vespasian.config.example.json', 'scripts', 'bin', 'package.json']) {
    await cp(join(REPO_ROOT, item), join(dir, item), { recursive: true });
  }
  return dir;
}

test('default --yes run produces .env from the Wix template and records next steps', async (t) => {
  const dir = await stageFixture();
  t.after(() => rm(dir, { recursive: true, force: true }));

  const { stdout } = await exec('node', ['scripts/init.mjs', '--yes', '--no-git',
    '--name=smoke-site'], { cwd: dir, env: ENV });

  assert.match(stdout, /✓ \.env/);
  assert.match(stdout, /✓ site \(next-steps\)/);
  assert.match(stdout, /✓ verify/);
  assert.match(stdout, /vespasian pipeline indesign/);

  const env = await readFile(join(dir, '.env'), 'utf8');
  assert.match(env, /^WIX_API_KEY=$/m);
  assert.match(env, /^WIX_SITE_ID=$/m);
  const next = await readFile(join(dir, 'docs/NEXT-STEPS.md'), 'utf8');
  assert.match(next, /vespasian site create/);
});

test('--site-id connects an existing site and records WIX_SITE_ID', async (t) => {
  const dir = await stageFixture();
  t.after(() => rm(dir, { recursive: true, force: true }));

  const { stdout } = await exec('node', ['scripts/init.mjs', '--yes', '--no-git',
    '--name=smoke-connect', '--site-id=11111111-2222-3333-4444-555555555555'], { cwd: dir, env: ENV });

  assert.match(stdout, /✓ site \(connected\)/);
  const env = await readFile(join(dir, '.env'), 'utf8');
  assert.match(env, /^WIX_SITE_ID=11111111-2222-3333-4444-555555555555$/m);
});

test('--api-key/--account-id land in .env (dry-run keeps the site step offline)', async (t) => {
  const dir = await stageFixture();
  t.after(() => rm(dir, { recursive: true, force: true }));

  const { stdout } = await exec('node', ['scripts/init.mjs', '--yes', '--no-git',
    '--name=smoke-creds', '--create-site', '--api-key=test-key', '--account-id=test-account'],
    { cwd: dir, env: { ...process.env, VESPASIAN_DRY_RUN: '1' } });

  assert.match(stdout, /✓ site \(next-steps\)/); // dry-run downgrades create → next-steps
  const env = await readFile(join(dir, '.env'), 'utf8');
  assert.match(env, /^WIX_API_KEY=test-key$/m);
  assert.match(env, /^WIX_ACCOUNT_ID=test-account$/m);
});

test('--site-id conflicting with --create-site is rejected (exit 2)', async (t) => {
  const dir = await stageFixture();
  t.after(() => rm(dir, { recursive: true, force: true }));

  await assert.rejects(
    () => exec('node', ['scripts/init.mjs', '--yes', '--no-git',
      '--name=x', '--site-id=abc', '--create-site'], { cwd: dir, env: ENV }),
    (err) => err.code === 2 && /conflicts/i.test(err.stderr)
  );
});

test('unknown flags are rejected (exit 2)', async (t) => {
  const dir = await stageFixture();
  t.after(() => rm(dir, { recursive: true, force: true }));

  await assert.rejects(
    () => exec('node', ['scripts/init.mjs', '--yes', '--woo'], { cwd: dir, env: ENV }),
    { code: 2 }
  );
});

test('a leading "--" separator (as pnpm forwards it) is tolerated', async (t) => {
  const dir = await stageFixture();
  t.after(() => rm(dir, { recursive: true, force: true }));

  const { stdout } = await exec('node', ['scripts/init.mjs', '--', '--yes', '--no-git',
    '--name=dash-sep'], { cwd: dir, env: ENV });
  assert.match(stdout, /✓ verify/);
});

test('git init produces an initial commit', async (t) => {
  const dir = await stageFixture();
  t.after(() => rm(dir, { recursive: true, force: true }));

  await exec('node', ['scripts/init.mjs', '--yes', '--name=smoke-git'], { cwd: dir, env: ENV });
  const { stdout } = await exec('git', ['log', '--oneline'], { cwd: dir });
  assert.match(stdout, /chore: initial Vespasian scaffold/);
});
