import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupSite } from '../../../scripts/init/generators/site.mjs';

const NO_DRY_RUN = { VESPASIAN_DRY_RUN: '' };

test('connect mode is a no-op beyond .env (already written by the env step)', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'site-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const result = await setupSite(dir, { siteMode: 'connect', siteId: 'abc' }, { env: NO_DRY_RUN });
  assert.equal(result.mode, 'connected');
  await assert.rejects(() => access(join(dir, 'docs/NEXT-STEPS.md'), constants.F_OK));
});

test('create mode with credentials runs `vespasian site create`', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'site-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const calls = [];
  const fakeExec = async (cmd, args, opts) => { calls.push({ cmd, args, opts }); return { stdout: '', stderr: '' }; };

  const result = await setupSite(dir, {
    projectName: 'shop', siteTitle: 'The Shop', siteMode: 'create', apiKey: 'k', accountId: 'a',
  }, { exec: fakeExec, env: NO_DRY_RUN });

  assert.equal(result.mode, 'created');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, process.execPath);
  assert.deepEqual(calls[0].args.slice(-3), ['site', 'create', 'The Shop']);
  assert.match(calls[0].args[0], /bin[\\/]vespasian\.mjs$/);
  assert.equal(calls[0].opts.cwd, dir);
  assert.equal(calls[0].opts.env.WIX_API_KEY, 'k');
  assert.equal(calls[0].opts.env.WIX_ACCOUNT_ID, 'a');
});

test('create mode without credentials records a next-step instead', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'site-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const fakeExec = async () => { throw new Error('must not be called'); };
  const result = await setupSite(dir, {
    projectName: 'shop', siteTitle: 'The Shop', siteMode: 'create', apiKey: null, accountId: null,
  }, { exec: fakeExec, env: NO_DRY_RUN });

  assert.equal(result.mode, 'next-steps');
  const next = await readFile(join(dir, 'docs/NEXT-STEPS.md'), 'utf8');
  assert.match(next, /vespasian site create "The Shop"/);
  assert.match(next, /WIX_API_KEY/);
  assert.match(next, /No API credentials/);
});

test('create mode under VESPASIAN_DRY_RUN never spawns the CLI', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'site-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const fakeExec = async () => { throw new Error('must not be called'); };
  const result = await setupSite(dir, {
    projectName: 'shop', siteTitle: 'The Shop', siteMode: 'create', apiKey: 'k', accountId: 'a',
  }, { exec: fakeExec, env: { VESPASIAN_DRY_RUN: '1' } });

  assert.equal(result.mode, 'next-steps');
  const next = await readFile(join(dir, 'docs/NEXT-STEPS.md'), 'utf8');
  assert.match(next, /Dry-run mode/);
});

test('skip mode records the full next-steps runbook', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'site-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const result = await setupSite(dir, { projectName: 'shop', siteTitle: 'The Shop', siteMode: 'skip' }, { env: NO_DRY_RUN });
  assert.equal(result.mode, 'next-steps');
  const next = await readFile(join(dir, 'docs/NEXT-STEPS.md'), 'utf8');
  assert.match(next, /vespasian site use <site-id>/);
  assert.match(next, /vespasian login --editor/);
  assert.match(next, /vespasian pipeline indesign/);
});
