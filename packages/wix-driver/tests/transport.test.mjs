// Transport: header injection, 429 backoff, error taxonomy, revision updates.
// No network — fetch is always faked.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createTransport, revisionAwareUpdate } from '../src/rest/transport.js';
import { WixApiError } from '../src/rest/errors.js';

function response(status, body = {}) {
	return {
		ok: status >= 200 && status < 300,
		status,
		text: async () => JSON.stringify(body),
	};
}

/** Fake fetch that pops queued responses and records calls. */
function fakeFetch(queue) {
	const calls = [];
	const impl = async (url, init) => {
		calls.push({ url, ...init });
		if (queue.length === 0) throw new Error('fakeFetch: queue exhausted');
		return queue.shift();
	};
	return { impl, calls };
}

const CREDS = { apiKey: 'test-key', accountId: 'acct-1', siteId: 'site-1' };

test('site-scope requests send Authorization + wix-site-id (and NOT wix-account-id)', async () => {
	const { impl, calls } = fakeFetch([response(200, { ok: 1 })]);
	const transport = createTransport({ ...CREDS, fetchImpl: impl });
	await transport.request({ method: 'GET', path: '/editor-urls/v2/editor-urls', scope: 'site' });

	assert.equal(calls.length, 1);
	assert.equal(calls[0].url, 'https://www.wixapis.com/editor-urls/v2/editor-urls');
	assert.equal(calls[0].headers.Authorization, 'test-key');
	assert.equal(calls[0].headers['wix-site-id'], 'site-1');
	assert.equal('wix-account-id' in calls[0].headers, false);
});

test('account-scope requests send wix-account-id (and NOT wix-site-id)', async () => {
	const { impl, calls } = fakeFetch([response(200)]);
	const transport = createTransport({ ...CREDS, fetchImpl: impl });
	await transport.request({ method: 'POST', path: '/funnel/projects/v1/create', scope: 'account', body: { name: 'x' } });

	assert.equal(calls[0].headers['wix-account-id'], 'acct-1');
	assert.equal('wix-site-id' in calls[0].headers, false);
	assert.equal(calls[0].headers['Content-Type'], 'application/json');
	assert.deepEqual(JSON.parse(calls[0].body), { name: 'x' });
});

test('per-request siteId overrides the default', async () => {
	const { impl, calls } = fakeFetch([response(200)]);
	const transport = createTransport({ ...CREDS, fetchImpl: impl });
	await transport.request({ method: 'GET', path: '/x', scope: 'site', siteId: 'site-override' });
	assert.equal(calls[0].headers['wix-site-id'], 'site-override');
});

test('absolute URLs (signed upload) get NO auth headers', async () => {
	const { impl, calls } = fakeFetch([response(200)]);
	const transport = createTransport({ ...CREDS, fetchImpl: impl });
	await transport.request({
		method: 'PUT',
		path: 'https://upload.wixmp.com/signed/123',
		rawBody: new Uint8Array([1, 2]),
		headers: { 'Content-Type': 'image/png' },
	});
	assert.equal('Authorization' in calls[0].headers, false);
	assert.equal('wix-site-id' in calls[0].headers, false);
	assert.equal(calls[0].url, 'https://upload.wixmp.com/signed/123');
});

test('missing API key fails fast with kind=auth (no fetch attempted)', async () => {
	const { impl, calls } = fakeFetch([]);
	const transport = createTransport({ apiKey: undefined, accountId: 'a', siteId: 's', fetchImpl: impl });
	await assert.rejects(
		() => transport.request({ method: 'GET', path: '/x', scope: 'site' }),
		(error) => error instanceof WixApiError && error.kind === 'auth',
	);
	assert.equal(calls.length, 0);
});

test('429 retries with the configured backoff, then succeeds', async () => {
	const { impl, calls } = fakeFetch([response(429), response(429), response(200, { done: true })]);
	const waits = [];
	const transport = createTransport({
		...CREDS,
		fetchImpl: impl,
		sleep: async (ms) => waits.push(ms),
		backoffMs: 60_000,
	});
	const result = await transport.request({ method: 'GET', path: '/x', scope: 'site' });
	assert.deepEqual(result, { done: true });
	assert.equal(calls.length, 3);
	assert.deepEqual(waits, [60_000, 60_000]);
});

test('exhausted 429 retries surface as kind=quota', async () => {
	const { impl } = fakeFetch([response(429), response(429)]);
	const transport = createTransport({ ...CREDS, fetchImpl: impl, sleep: async () => {}, maxRetries: 1 });
	await assert.rejects(
		() => transport.request({ method: 'GET', path: '/x', scope: 'site' }),
		(error) => error instanceof WixApiError && error.kind === 'quota' && error.status === 429,
	);
});

test('error taxonomy: 401→auth, 403→scope, 404→not-found, 409→conflict, 428→not-publishable', async () => {
	const cases = [
		[401, 'auth'],
		[403, 'scope'],
		[404, 'not-found'],
		[409, 'conflict'],
		[428, 'not-publishable'],
	];
	for (const [status, kind] of cases) {
		const { impl } = fakeFetch([response(status, { message: 'nope' })]);
		const transport = createTransport({ ...CREDS, fetchImpl: impl });
		await assert.rejects(
			() => transport.request({ method: 'GET', path: '/x', scope: 'site' }),
			(error) => error instanceof WixApiError && error.kind === kind && error.status === status,
			`status ${status} should map to kind ${kind}`,
		);
	}
});

test('revisionAwareUpdate refetches and retries once on 409 conflict', async () => {
	let fetches = 0;
	let updates = 0;
	const result = await revisionAwareUpdate({
		fetchCurrent: async () => ({ revision: String(++fetches) }),
		applyUpdate: async (current) => {
			updates += 1;
			if (updates === 1) throw new WixApiError('conflict', 'stale revision');
			return { updatedWith: current.revision };
		},
	});
	assert.deepEqual(result, { updatedWith: '2' });
	assert.equal(fetches, 2);
});
