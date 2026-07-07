// API-key plane credentials (Plane 1).
//
// An ACCOUNT-LEVEL API key from manage.wix.com/account/api-keys, sent as
// `Authorization: <key>` plus exactly one of wix-account-id / wix-site-id.
// Site-level calls only work with a key from the SITE OWNER's account.
// API keys can NOT open the editor — that is the editor plane's job.

import { WixApiError } from '../rest/errors.js';

/**
 * Resolve API credentials from options and the environment.
 * @param {Object} [options]
 * @param {string} [options.apiKey]
 * @param {string} [options.accountId]
 * @param {string} [options.siteId]
 * @param {string} [options.metasiteId]
 * @param {NodeJS.ProcessEnv} [options.env]
 */
export function resolveApiCredentials(options = {}) {
	const env = options.env ?? process.env;
	return {
		apiKey: options.apiKey ?? env.WIX_API_KEY,
		accountId: options.accountId ?? env.WIX_ACCOUNT_ID,
		siteId: options.siteId ?? env.WIX_SITE_ID,
		metasiteId: options.metasiteId ?? env.WIX_METASITE_ID,
	};
}

/**
 * Assert the credentials required for a given scope are present.
 * @param {{ apiKey?: string, accountId?: string, siteId?: string }} creds
 * @param {'account'|'site'} scope
 */
export function assertCredentials(creds, scope) {
	if (!creds.apiKey) {
		throw new WixApiError('auth', 'WIX_API_KEY is not set — create an account-level key at manage.wix.com/account/api-keys');
	}
	if (scope === 'account' && !creds.accountId) {
		throw new WixApiError('auth', 'WIX_ACCOUNT_ID is not set (required for account-level calls)');
	}
	if (scope === 'site' && !creds.siteId) {
		throw new WixApiError('auth', 'WIX_SITE_ID is not set (run `vespasian site create` or `vespasian site use`)');
	}
	return creds;
}

/**
 * Build the auth headers for a scope — exactly one id header, never both.
 * @param {{ apiKey: string, accountId?: string, siteId?: string }} creds
 * @param {'account'|'site'} scope
 */
export function authHeaders(creds, scope) {
	assertCredentials(creds, scope);
	const headers = { Authorization: creds.apiKey };
	if (scope === 'account') headers['wix-account-id'] = creds.accountId;
	else headers['wix-site-id'] = creds.siteId;
	return headers;
}
