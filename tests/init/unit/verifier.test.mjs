import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verify } from '../../../scripts/init/verifier.mjs';

const NO_DRY_RUN = { VESPASIAN_DRY_RUN: '' };

async function scaffoldOk() {
  const dir = await mkdtemp(join(tmpdir(), 'verify-'));
  await writeFile(join(dir, '.env'), '# comment\nWIX_API_KEY=\nWIX_SITE_ID=abc\n');
  await writeFile(join(dir, 'vespasian.config.example.json'), '{"pipeline":{"indesign":{"output":".vespasian/plans"}}}');
  return dir;
}

test('passes for a valid scaffold without credentials (ping cleanly skipped)', async (t) => {
  const dir = await scaffoldOk();
  t.after(() => rm(dir, { recursive: true, force: true }));

  const result = await verify(dir, { projectName: 'foo' }, { env: NO_DRY_RUN });
  assert.equal(result.ok, true, JSON.stringify(result.failures));
});

test('fails when .env missing', async (t) => {
  const dir = await scaffoldOk();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await rm(join(dir, '.env'));

  const result = await verify(dir, { projectName: 'foo' }, { env: NO_DRY_RUN });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some(f => /\.env/.test(f.check)));
});

test('fails when .env has a malformed line', async (t) => {
  const dir = await scaffoldOk();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, '.env'), 'WIX_API_KEY=\nthis is not an assignment\n');

  const result = await verify(dir, { projectName: 'foo' }, { env: NO_DRY_RUN });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some(f => /not KEY=value/.test(f.reason)));
});

test('fails when the config example is missing or invalid JSON', async (t) => {
  const dir = await scaffoldOk();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'vespasian.config.example.json'), '{not json');

  const result = await verify(dir, { projectName: 'foo' }, { env: NO_DRY_RUN });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some(f => /config example/.test(f.check)));
});

test('pings the Wix API when credentials are set (injected fetch, no network)', async (t) => {
  const dir = await scaffoldOk();
  t.after(() => rm(dir, { recursive: true, force: true }));

  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200 };
  };

  const result = await verify(dir, { projectName: 'foo', apiKey: 'k', accountId: 'a' }, { fetch: fakeFetch, env: NO_DRY_RUN });
  assert.equal(result.ok, true, JSON.stringify(result.failures));
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /wixapis\.com/);
  assert.equal(calls[0].init.headers.Authorization, 'k');
  assert.equal(calls[0].init.headers['wix-account-id'], 'a');
});

test('reports rejected credentials as a verification failure', async (t) => {
  const dir = await scaffoldOk();
  t.after(() => rm(dir, { recursive: true, force: true }));

  const fakeFetch = async () => ({ ok: false, status: 403 });
  const result = await verify(dir, { projectName: 'foo', apiKey: 'bad', accountId: 'a' }, { fetch: fakeFetch, env: NO_DRY_RUN });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some(f => /rejected the credentials/.test(f.reason)));
});

test('skips the ping entirely in dry-run mode', async (t) => {
  const dir = await scaffoldOk();
  t.after(() => rm(dir, { recursive: true, force: true }));

  const fakeFetch = async () => { throw new Error('must not be called'); };
  const result = await verify(
    dir,
    { projectName: 'foo', apiKey: 'k', accountId: 'a' },
    { fetch: fakeFetch, env: { VESPASIAN_DRY_RUN: '1' } }
  );
  assert.equal(result.ok, true, JSON.stringify(result.failures));
});
