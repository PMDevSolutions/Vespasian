import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDefaults } from '../../../scripts/init/default-resolver.mjs';

test('all defaults when flags empty', () => {
  const cfg = resolveDefaults({}, { cwdBasename: 'my-site' });
  assert.equal(cfg.projectName, 'my-site');
  assert.equal(cfg.siteTitle, 'My Site');
  assert.equal(cfg.siteMode, 'skip');
  assert.equal(cfg.apiKey, null);
  assert.equal(cfg.accountId, null);
  assert.equal(cfg.siteId, null);
  assert.equal(cfg.hasWixAccount, false);
  assert.equal(cfg.initGit, true);
});

test('flag overrides win over defaults', () => {
  const cfg = resolveDefaults(
    { name: 'shop', title: 'The Shop' },
    { cwdBasename: 'ignored' }
  );
  assert.equal(cfg.projectName, 'shop');
  assert.equal(cfg.siteTitle, 'The Shop');
});

test('--site-id selects connect mode and records the id', () => {
  const cfg = resolveDefaults(
    { siteId: 'abc-123' },
    { cwdBasename: 'x' }
  );
  assert.equal(cfg.siteMode, 'connect');
  assert.equal(cfg.siteId, 'abc-123');
  assert.equal(cfg.hasWixAccount, true);
});

test('--create-site selects create mode', () => {
  const cfg = resolveDefaults(
    { createSite: true, apiKey: 'k', accountId: 'a' },
    { cwdBasename: 'x' }
  );
  assert.equal(cfg.siteMode, 'create');
  assert.equal(cfg.apiKey, 'k');
  assert.equal(cfg.accountId, 'a');
});

test('--site-id conflicting with --create-site throws', () => {
  assert.throws(
    () => resolveDefaults({ siteId: 'abc', createSite: true }, { cwdBasename: 'x' }),
    /conflicts/i
  );
});

test('credentials imply hasWixAccount', () => {
  const cfg = resolveDefaults({ apiKey: 'key' }, { cwdBasename: 'x' });
  assert.equal(cfg.hasWixAccount, true);
});

test('blank / whitespace credentials are normalised to null', () => {
  const cfg = resolveDefaults({ apiKey: '  ', accountId: '', siteId: undefined }, { cwdBasename: 'x' });
  assert.equal(cfg.apiKey, null);
  assert.equal(cfg.accountId, null);
  assert.equal(cfg.siteId, null);
});

test('noGit flag flips initGit', () => {
  const cfg = resolveDefaults({ noGit: true }, { cwdBasename: 'x' });
  assert.equal(cfg.initGit, false);
});
