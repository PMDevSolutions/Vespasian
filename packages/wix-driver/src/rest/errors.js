// Structured error taxonomy for the Wix REST plane.
//
// Every failure surfaced by the transport is a WixApiError with a `kind`
// drawn from a small closed set, so callers (executor, CLI) can branch on
// error class instead of parsing message strings.

/** @typedef {'auth'|'scope'|'quota'|'not-found'|'conflict'|'validation'|'not-publishable'|'network'|'unknown'} WixApiErrorKind */

export class WixApiError extends Error {
	/**
	 * @param {WixApiErrorKind} kind
	 * @param {string} message
	 * @param {{ status?: number, method?: string, url?: string, details?: unknown, cause?: unknown }} [info]
	 */
	constructor(kind, message, info = {}) {
		super(message, info.cause ? { cause: info.cause } : undefined);
		this.name = 'WixApiError';
		this.kind = kind;
		this.status = info.status;
		this.method = info.method;
		this.url = info.url;
		this.details = info.details;
	}
}

/** Map an HTTP status to the taxonomy. 429 is handled by the retry loop first. */
export function kindForStatus(status) {
	switch (status) {
		case 400:
			return 'validation';
		case 401:
			return 'auth';
		case 403:
			return 'scope';
		case 404:
			return 'not-found';
		case 409:
			return 'conflict';
		case 428:
			// Publish Site returns 428 SITE_IS_NOT_DEFINED_AS_PUBLISHABLE for
			// sites with neither a template nor a headless structure.
			return 'not-publishable';
		case 429:
			return 'quota';
		default:
			return 'unknown';
	}
}

export function isWixApiError(value, kind) {
	return value instanceof WixApiError && (kind === undefined || value.kind === kind);
}
