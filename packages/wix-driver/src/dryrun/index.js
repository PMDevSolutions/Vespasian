// Recording transport — the dry-run twin of rest/transport.js.
//
// Implements the same `request()` interface but never touches the network:
// every intended request is recorded ({ method, url, headers-sans-secrets,
// body }) to an in-memory log and, optionally, a JSONL file under
// .vespasian/dryrun/. Responses come from bundled fixtures so the executor
// completes all API phases with zero credentials.
//
// Activated by VESPASIAN_DRY_RUN=1 or createRestClient({ dryRun: true }).

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { WIX_API_BASE_URL } from '../rest/transport.js';
import { cannedResponse } from './fixtures.js';

const SECRET_HEADERS = new Set(['authorization', 'cookie', 'x-api-key']);

function redactHeaders(headers = {}) {
	const out = {};
	for (const [key, value] of Object.entries(headers)) {
		out[key] = SECRET_HEADERS.has(key.toLowerCase()) ? '<redacted>' : value;
	}
	return out;
}

/** Default JSONL location when file recording is requested without a path. */
export function defaultDryRunLogPath(baseDir = '.vespasian') {
	return join(baseDir, 'dryrun', 'requests.jsonl');
}

/**
 * @param {Object} [options]
 * @param {string} [options.accountId]  Echoed into recorded headers (never a secret).
 * @param {string} [options.siteId]
 * @param {string} [options.baseUrl]
 * @param {string|null} [options.logFile]  JSONL file path; null/undefined = in-memory only.
 * @param {Array<object>} [options.log]    Bring-your-own log array (shared across transports).
 * @param {(req: object, seq: number) => any} [options.respond]  Override fixture lookup.
 * @returns {import('../rest/transport.js').Transport & { log: object[], isDryRun: true }}
 */
export function createDryRunTransport(options = {}) {
	const {
		accountId = process.env.WIX_ACCOUNT_ID ?? 'dry-run-account',
		siteId = process.env.WIX_SITE_ID ?? 'dry-run-site',
		baseUrl = WIX_API_BASE_URL,
		logFile = null,
		log = [],
		respond = cannedResponse,
	} = options;

	let seq = 0;
	let logFileReady = false;

	function record(entry) {
		log.push(entry);
		if (logFile) {
			if (!logFileReady) {
				mkdirSync(dirname(logFile), { recursive: true });
				logFileReady = true;
			}
			appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
		}
	}

	async function request(req) {
		const { method, path, scope = 'site', body, rawBody, query, headers: extraHeaders = {} } = req;

		const absolute = /^https?:\/\//i.test(path);
		let url = absolute ? path : `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
		if (query && Object.keys(query).length > 0) {
			url += (url.includes('?') ? '&' : '?') + new URLSearchParams(query).toString();
		}

		const headers = { ...extraHeaders };
		if (!absolute) {
			headers.Authorization = '<redacted>';
			if (scope === 'account') headers['wix-account-id'] = accountId;
			else if (scope === 'site') headers['wix-site-id'] = req.siteId ?? siteId;
		}

		seq += 1;
		const entry = {
			seq,
			method,
			url,
			headers: redactHeaders(headers),
			body: body ?? (rawBody !== undefined ? { rawBodyBytes: rawBody.length ?? 0 } : undefined),
		};
		record(entry);

		return respond({ method, url, body }, seq);
	}

	return {
		request,
		context: { siteId, accountId },
		log,
		isDryRun: true,
	};
}
