// Typed Wix REST client — plain fetch, no SDK.
//
// createRestClient() composes the per-family modules over a shared transport.
// With VESPASIAN_DRY_RUN=1 (or { dryRun: true }) the transport is swapped for
// the recording transport from ../dryrun/ — same interface, canned responses,
// zero network.

import { createTransport } from './transport.js';
import { projectsApi } from './projects.js';
import { siteActionsApi } from './siteActions.js';
import { sitesApi } from './sites.js';
import { editorUrlsApi } from './editorUrls.js';
import { mediaApi } from './media.js';
import { dataApi } from './data.js';
import { embedsApi } from './embeds.js';
import { propertiesApi } from './properties.js';
import { seoFilesApi } from './seoFiles.js';
import { createDryRunTransport } from '../dryrun/index.js';

export { createTransport, revisionAwareUpdate, WIX_API_BASE_URL } from './transport.js';
export { WixApiError, isWixApiError, kindForStatus } from './errors.js';
export { assertEditorType, editorTypeOf, EDITOR_TYPES } from './editorUrls.js';
export { isFileReady } from './media.js';
export { EMBED_HTML_MAX_CHARS } from './embeds.js';

export function isDryRunEnv(env = process.env) {
	return env.VESPASIAN_DRY_RUN === '1' || env.VESPASIAN_DRY_RUN === 'true';
}

/**
 * Build a full REST client from a transport (or transport options).
 *
 * @param {Object} [options] transport options (apiKey, accountId, siteId,
 *   fetchImpl, sleep, backoffMs, maxRetries) plus:
 * @param {boolean} [options.dryRun]  Force the recording transport
 *   (defaults to VESPASIAN_DRY_RUN=1).
 * @param {import('./transport.js').Transport} [options.transport]  Bring your own.
 */
export function createRestClient(options = {}) {
	const { dryRun = isDryRunEnv(), transport: providedTransport, ...transportOptions } = options;
	const transport =
		providedTransport ?? (dryRun ? createDryRunTransport(transportOptions) : createTransport(transportOptions));

	return {
		transport,
		dryRun: Boolean(dryRun && !providedTransport) || Boolean(transport.isDryRun),
		projects: projectsApi(transport),
		siteActions: siteActionsApi(transport),
		sites: sitesApi(transport),
		editorUrls: editorUrlsApi(transport),
		media: mediaApi(transport, { sleep: transportOptions.sleep }),
		data: dataApi(transport),
		embeds: embedsApi(transport),
		properties: propertiesApi(transport),
		seoFiles: seoFilesApi(transport),
	};
}
