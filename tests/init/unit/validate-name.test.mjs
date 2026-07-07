import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateProjectName } from '../../../scripts/init/validate-name.mjs';

test('accepts valid kebab-case slug', () => {
  assert.equal(validateProjectName('my-shop'), null);
  assert.equal(validateProjectName('shop2'), null);
});

test('rejects empty / too-short names', () => {
  assert.match(validateProjectName(''), /required/i);
  assert.match(validateProjectName('a'), /at least 2/i);
});

test('rejects names longer than 40 chars', () => {
  assert.match(validateProjectName('a'.repeat(41)), /40 characters/i);
});

test('rejects names starting with a digit or dash', () => {
  assert.match(validateProjectName('2cool'), /start with a letter/i);
  assert.match(validateProjectName('-foo'), /start with a letter/i);
});

test('rejects names with uppercase or underscores', () => {
  assert.match(validateProjectName('MyShop'), /lowercase/i);
  assert.match(validateProjectName('my_shop'), /lowercase/i);
});

test('rejects reserved generic and Wix names', () => {
  assert.match(validateProjectName('admin'), /reserved/i);
  assert.match(validateProjectName('wix'), /reserved/i);
  assert.match(validateProjectName('wix-studio'), /reserved/i);
  assert.match(validateProjectName('vespasian'), /reserved/i);
});

test('former WordPress reserved slugs are no longer blocked', () => {
  assert.equal(validateProjectName('wp-admin'), null);
  assert.equal(validateProjectName('akismet'), null);
});
