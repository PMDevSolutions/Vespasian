import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv, readSiteStatus, siteStatusFromEnv } from '../../../src/core/wix/site-status';

test('parseEnv reads KEY=value lines, strips quotes, skips comments/blank/empty', () => {
  const env = parseEnv(
    [
      '# Wix API plane',
      'WIX_API_KEY="secret-key"',
      "WIX_ACCOUNT_ID='acct-1'",
      'WIX_SITE_ID=site-1',
      '',
      'WIX_METASITE_ID=',
      'not a kv line',
      '=nokey',
      'VESPASIAN_DRY_RUN=1',
    ].join('\n'),
  );
  assert.equal(env.WIX_API_KEY, 'secret-key');
  assert.equal(env.WIX_ACCOUNT_ID, 'acct-1');
  assert.equal(env.WIX_SITE_ID, 'site-1');
  assert.equal(env.WIX_METASITE_ID, undefined); // empty value dropped
  assert.equal(env.VESPASIAN_DRY_RUN, '1');
  assert.equal(Object.keys(env).length, 4);
});

test('siteStatusFromEnv reduces the key to a boolean and surfaces ids', () => {
  const status = siteStatusFromEnv(
    { WIX_API_KEY: 'k', WIX_SITE_ID: 's-1', WIX_METASITE_ID: 'm-1' },
    true,
    false,
  );
  assert.equal(status.hasApiKey, true);
  assert.equal(status.hasAccountId, false);
  assert.equal(status.siteId, 's-1');
  assert.equal(status.metasiteId, 'm-1');
  assert.equal(status.editorSessionCaptured, false);
  assert.equal(status.dryRun, false);
  // The raw key value must not appear anywhere in the status object.
  assert.ok(!JSON.stringify(status).includes('"k"'));
});

test('readSiteStatus reads .env + detects the default editor session file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vespasian-sitestatus-'));
  try {
    await writeFile(
      join(root, '.env'),
      'WIX_API_KEY=abc\nWIX_ACCOUNT_ID=acct\nWIX_SITE_ID=site-9\nVESPASIAN_DRY_RUN=true\n',
    );
    await mkdir(join(root, '.vespasian', 'session'), { recursive: true });
    await writeFile(join(root, '.vespasian', 'session', 'state.json'), '{}');

    const status = await readSiteStatus(root);
    assert.equal(status.hasEnvFile, true);
    assert.equal(status.hasApiKey, true);
    assert.equal(status.hasAccountId, true);
    assert.equal(status.siteId, 'site-9');
    assert.equal(status.editorSessionCaptured, true);
    assert.equal(status.dryRun, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readSiteStatus honors WIX_EDITOR_STORAGE_STATE for the session path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vespasian-sitestatus2-'));
  try {
    await writeFile(join(root, '.env'), 'WIX_EDITOR_STORAGE_STATE=custom/session.json\n');
    await mkdir(join(root, 'custom'), { recursive: true });
    await writeFile(join(root, 'custom', 'session.json'), '{}');
    const status = await readSiteStatus(root);
    assert.equal(status.editorSessionCaptured, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readSiteStatus with no .env reports everything unset (never throws)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vespasian-sitestatus3-'));
  try {
    const status = await readSiteStatus(root);
    assert.equal(status.hasEnvFile, false);
    assert.equal(status.hasApiKey, false);
    assert.equal(status.siteId, null);
    assert.equal(status.editorSessionCaptured, false);
    assert.equal(status.dryRun, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
