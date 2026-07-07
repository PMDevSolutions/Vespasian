import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeEnv } from '../../../scripts/init/generators/env.mjs';

const TEMPLATE = [
  '# API plane',
  'WIX_API_KEY=',
  'WIX_ACCOUNT_ID=',
  'WIX_SITE_ID=',
  '# Editor plane',
  'WIX_EDITOR_STORAGE_STATE=.vespasian/session/state.json',
].join('\n');

test('writes .env with the collected Wix credentials substituted', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'env-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  await writeFile(join(dir, '.env.example'), TEMPLATE);

  await writeEnv(dir, {
    projectName: 'my-site',
    apiKey: 'secret-key',
    accountId: 'acct-guid',
    siteId: 'site-guid',
  });

  const env = await readFile(join(dir, '.env'), 'utf8');
  assert.match(env, /^WIX_API_KEY=secret-key$/m);
  assert.match(env, /^WIX_ACCOUNT_ID=acct-guid$/m);
  assert.match(env, /^WIX_SITE_ID=site-guid$/m);
  // Untouched lines (comments + defaults) survive verbatim.
  assert.match(env, /^# API plane$/m);
  assert.match(env, /^WIX_EDITOR_STORAGE_STATE=\.vespasian\/session\/state\.json$/m);
});

test('missing credentials leave the template placeholders untouched', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'env-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  await writeFile(join(dir, '.env.example'), TEMPLATE);

  await writeEnv(dir, { projectName: 'plain', apiKey: null, accountId: null, siteId: null });

  const env = await readFile(join(dir, '.env'), 'utf8');
  assert.match(env, /^WIX_API_KEY=$/m);
  assert.match(env, /^WIX_ACCOUNT_ID=$/m);
  assert.match(env, /^WIX_SITE_ID=$/m);
});

test('keys absent from the template are appended', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'env-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  await writeFile(join(dir, '.env.example'), 'WIX_API_KEY=\n');

  await writeEnv(dir, { projectName: 'x', apiKey: 'k', siteId: 'appended-site' });

  const env = await readFile(join(dir, '.env'), 'utf8');
  assert.match(env, /^WIX_API_KEY=k$/m);
  assert.match(env, /^WIX_SITE_ID=appended-site$/m);
});

test('throws if .env.example missing', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'env-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  await assert.rejects(
    () => writeEnv(dir, { projectName: 'x' }),
    /\.env\.example not found/i
  );
});
