// Consent gate: editor operations refuse to run without the one-time
// recorded acknowledgment at .vespasian/consent.json.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	hasConsent,
	recordConsent,
	requireConsent,
	consentPath,
	ConsentRequiredError,
	CONSENT_VERSION,
} from '../src/editor/consent.js';
import { EditorSession } from '../src/editor/session.js';

test('requireConsent throws ConsentRequiredError when nothing is recorded', () => {
	const baseDir = mkdtempSync(join(tmpdir(), 'vsp-consent-'));
	assert.equal(hasConsent({ baseDir }), false);
	assert.throws(
		() => requireConsent({ baseDir }),
		(error) => error instanceof ConsentRequiredError && /vespasian login --editor/.test(error.message),
	);
});

test('recordConsent persists and unlocks the gate', () => {
	const baseDir = mkdtempSync(join(tmpdir(), 'vsp-consent-'));
	const record = recordConsent({ baseDir, acknowledgedBy: 'test-user' });
	assert.equal(record.version, CONSENT_VERSION);
	assert.equal(record.acknowledged, true);
	assert.ok(existsSync(consentPath({ baseDir })));

	const onDisk = JSON.parse(readFileSync(consentPath({ baseDir }), 'utf8'));
	assert.equal(onDisk.acknowledgedBy, 'test-user');
	assert.ok(onDisk.statement.includes('gray area'));

	assert.equal(hasConsent({ baseDir }), true);
	assert.doesNotThrow(() => requireConsent({ baseDir }));
});

test('a stale or corrupt consent record does not unlock the gate', () => {
	const baseDir = mkdtempSync(join(tmpdir(), 'vsp-consent-'));
	mkdirSync(baseDir, { recursive: true });
	writeFileSync(consentPath({ baseDir }), JSON.stringify({ version: 0, acknowledged: true }));
	assert.equal(hasConsent({ baseDir }), false);

	writeFileSync(consentPath({ baseDir }), 'not json');
	assert.equal(hasConsent({ baseDir }), false);
});

test('EditorSession.launch refuses without consent — before any browser work', async () => {
	const baseDir = mkdtempSync(join(tmpdir(), 'vsp-consent-'));
	const session = new EditorSession({ baseDir, storageStatePath: join(baseDir, 'state.json') });
	await assert.rejects(
		() => session.launch(),
		(error) => error instanceof ConsentRequiredError,
	);
	assert.equal(session.context, null);
});

test('editor session defaults follow the contract env vars', () => {
	const session = new EditorSession({
		env: {
			WIX_EDITOR_STORAGE_STATE: '/custom/state.json',
			WIX_EDITOR_HEADLESS: 'true',
			WIX_EDITOR_SLOWMO_MS: '300',
		},
	});
	assert.equal(session.options.storageStatePath, '/custom/state.json');
	assert.equal(session.options.headless, true);
	assert.equal(session.options.slowMo, 300);

	const defaults = new EditorSession({ env: {} });
	assert.equal(defaults.options.storageStatePath, join('.vespasian', 'session', 'state.json'));
	assert.equal(defaults.options.headless, false, 'headed is the conservative default');
	assert.equal(defaults.options.slowMo, 150);
});
