// HTTP transport for the Wix REST plane (https://www.wixapis.com).
//
// Responsibilities:
//   - header injection: `Authorization: <API key>` plus EXACTLY ONE of
//     `wix-account-id` (account-level calls) / `wix-site-id` (site-level calls)
//   - 429 handling: Wix publishes no hard rate limits; the documented advice
//     is "wait a minute and retry", so the default backoff is 60s (injectable
//     clock so tests never sleep for real)
//   - error taxonomy: every failure is a structured WixApiError
//   - revision-aware updates: optimistic-concurrency retry on 409
//
// The transport is plain `fetch` — no @wix/sdk, no runtime HTTP deps.

import { WixApiError, kindForStatus } from './errors.js';

export const WIX_API_BASE_URL = 'https://www.wixapis.com';

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @typedef {Object} TransportRequest
 * @property {string} method            HTTP method.
 * @property {string} path              Path under the Wix API base URL, or an
 *                                      absolute URL (signed upload URLs).
 * @property {'account'|'site'|'none'} [scope]  Which id header to inject
 *                                      (default 'site'). 'none' sends only the
 *                                      Authorization header; absolute URLs send
 *                                      no auth headers at all (signed URLs).
 * @property {string} [siteId]          Per-request override of the default site.
 * @property {object} [body]            JSON body.
 * @property {Uint8Array|string} [rawBody]  Raw body (media uploads).
 * @property {Record<string,string>} [query]
 * @property {Record<string,string>} [headers]
 *
 * @typedef {Object} Transport
 * @property {(req: TransportRequest) => Promise<any>} request
 * @property {{ siteId?: string, accountId?: string }} context
 */

/**
 * Create the live transport.
 *
 * @param {Object} [options]
 * @param {string} [options.apiKey]     Default: WIX_API_KEY.
 * @param {string} [options.accountId]  Default: WIX_ACCOUNT_ID.
 * @param {string} [options.siteId]     Default: WIX_SITE_ID.
 * @param {string} [options.baseUrl]
 * @param {typeof fetch} [options.fetchImpl]  Injectable for tests.
 * @param {(ms: number) => Promise<void>} [options.sleep]  Injectable clock.
 * @param {number} [options.backoffMs]  429 backoff (default 60_000).
 * @param {number} [options.maxRetries] Max 429 retries (default 3).
 * @returns {Transport}
 */
export function createTransport(options = {}) {
	const {
		apiKey = process.env.WIX_API_KEY,
		accountId = process.env.WIX_ACCOUNT_ID,
		siteId = process.env.WIX_SITE_ID,
		baseUrl = WIX_API_BASE_URL,
		fetchImpl = globalThis.fetch,
		sleep = defaultSleep,
		backoffMs = 60_000,
		maxRetries = 3,
	} = options;

	async function request(req) {
		const {
			method,
			path,
			scope = 'site',
			body,
			rawBody,
			query,
			headers: extraHeaders = {},
		} = req;

		const absolute = /^https?:\/\//i.test(path);
		let url = absolute ? path : `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
		if (query && Object.keys(query).length > 0) {
			const usp = new URLSearchParams(query);
			url += (url.includes('?') ? '&' : '?') + usp.toString();
		}

		const headers = { ...extraHeaders };
		if (!absolute) {
			// Signed URLs (upload.wixmp.com) must NOT receive the API key.
			if (!apiKey) {
				throw new WixApiError('auth', 'WIX_API_KEY is not set (pass apiKey or export WIX_API_KEY)', { method, url });
			}
			headers.Authorization = apiKey;
			if (scope === 'account') {
				if (!accountId) {
					throw new WixApiError('auth', 'WIX_ACCOUNT_ID is required for account-level calls', { method, url });
				}
				headers['wix-account-id'] = accountId;
			} else if (scope === 'site') {
				const effectiveSiteId = req.siteId ?? siteId;
				if (!effectiveSiteId) {
					throw new WixApiError('auth', 'WIX_SITE_ID is required for site-level calls (run `vespasian site use`)', { method, url });
				}
				headers['wix-site-id'] = effectiveSiteId;
			}
			// scope === 'none': Authorization only.
		}

		let fetchBody;
		if (rawBody !== undefined) {
			fetchBody = rawBody;
		} else if (body !== undefined) {
			headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
			fetchBody = JSON.stringify(body);
		}

		let attempt = 0;
		for (;;) {
			let response;
			try {
				response = await fetchImpl(url, { method, headers, body: fetchBody });
			} catch (cause) {
				throw new WixApiError('network', `Network failure calling ${method} ${url}`, { method, url, cause });
			}

			if (response.status === 429 && attempt < maxRetries) {
				attempt += 1;
				await sleep(backoffMs);
				continue;
			}

			const text = typeof response.text === 'function' ? await response.text() : '';
			let parsed;
			try {
				parsed = text ? JSON.parse(text) : undefined;
			} catch {
				parsed = text;
			}

			if (!response.ok) {
				const kind = kindForStatus(response.status);
				const detail =
					parsed && typeof parsed === 'object' && parsed.message ? `: ${parsed.message}` : '';
				throw new WixApiError(kind, `Wix API ${method} ${url} failed (${response.status})${detail}`, {
					status: response.status,
					method,
					url,
					details: parsed,
				});
			}

			return parsed ?? {};
		}
	}

	return { request, context: { siteId, accountId } };
}

/**
 * Optimistic-concurrency helper for revision-carrying entities (e.g. custom
 * embeds). Fetches the current entity, applies the update with its revision,
 * and on a 409 conflict re-fetches once and retries.
 *
 * @template T
 * @param {Object} args
 * @param {() => Promise<{ revision: string|number }>} args.fetchCurrent
 * @param {(current: { revision: string|number }) => Promise<T>} args.applyUpdate
 * @param {number} [args.maxAttempts]
 * @returns {Promise<T>}
 */
export async function revisionAwareUpdate({ fetchCurrent, applyUpdate, maxAttempts = 2 }) {
	let lastError;
	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
		const current = await fetchCurrent();
		try {
			return await applyUpdate(current);
		} catch (error) {
			if (error instanceof WixApiError && error.kind === 'conflict') {
				lastError = error;
				continue; // stale revision — re-fetch and retry
			}
			throw error;
		}
	}
	throw lastError ?? new WixApiError('conflict', 'revisionAwareUpdate exhausted retries');
}
