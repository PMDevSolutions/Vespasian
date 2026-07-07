// Editor URLs — the sanctioned bridge from the API plane to the editor plane.
//
// GET /editor-urls/v2/editor-urls  (site-level, scope SCOPE.DC-SITES.READ-URLS)
//   → editorUrl, previewUrl, editorType ∈ {WIX_EDITOR, WIX_STUDIO, ODEDITOR,
//     WIXEL, EDITORLESS}
//
// NEVER template editor.wix.com URLs — always resolve through this endpoint.
// editorType is the branch point for the whole Playwright strategy, and the
// provisioner must assert WIX_STUDIO immediately after site creation (it is
// unverified whether API-created sites always land on the Studio editor).

import { WixApiError } from './errors.js';

export const EDITOR_TYPES = Object.freeze([
	'WIX_EDITOR',
	'WIX_STUDIO',
	'ODEDITOR',
	'WIXEL',
	'EDITORLESS',
]);

/**
 * Extract the editorType from a Get Editor URLs response (shape is tolerant:
 * top-level `editorType`, or the first entry of an `editorUrls` array).
 */
export function editorTypeOf(response) {
	if (!response || typeof response !== 'object') return undefined;
	if (typeof response.editorType === 'string') return response.editorType;
	const first = Array.isArray(response.editorUrls) ? response.editorUrls[0] : undefined;
	return first?.editorType;
}

/**
 * Assert that a site uses the expected editor flavor (default WIX_STUDIO —
 * the only editor supporting custom CSS, breakpoints, and section grids).
 * Throws a WixApiError of kind 'validation' otherwise, so provisioning fails
 * fast instead of driving the wrong editor.
 */
export function assertEditorType(response, expected = 'WIX_STUDIO') {
	const actual = editorTypeOf(response);
	if (actual !== expected) {
		throw new WixApiError(
			'validation',
			`Site editor type is ${actual ?? 'unknown'}, expected ${expected}. ` +
				'Vespasian v1 targets Wix Studio only — pick a confirmed-Studio templateId.',
			{ details: response },
		);
	}
	return response;
}

/** @param {import('./transport.js').Transport} transport */
export function editorUrlsApi(transport) {
	return {
		/**
		 * Resolve editorUrl + previewUrl + editorType for a site.
		 * @param {{ siteId?: string }} [input]
		 */
		async getEditorUrls({ siteId } = {}) {
			return transport.request({
				method: 'GET',
				path: '/editor-urls/v2/editor-urls',
				scope: 'site',
				siteId,
			});
		},

		/**
		 * List published site URLs (the live URL for QA). Path is best-effort:
		 * documented as the sibling "List Published Site URLs" method under
		 * business-management/site-urls.
		 * @param {{ siteId?: string }} [input]
		 */
		async listPublishedSiteUrls({ siteId } = {}) {
			return transport.request({
				method: 'GET',
				path: '/site-urls/v1/published-site-urls',
				scope: 'site',
				siteId,
			});
		},

		assertEditorType,
	};
}
