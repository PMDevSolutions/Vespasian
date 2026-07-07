// SEO files — the only REST-writable SEO surface: robots.txt and llms.txt.
// Per-page title/meta for static pages has NO API (editor panel only — see
// the editor seoPanel flow).
//
// NOTE: exact paths are best-effort — the docs place Robots Txt / LLMs Txt
// under business-management/marketing/seo without a pinned URL in our research
// corpus. Adjust here (single point) if verification shows a different prefix.

/** @param {import('./transport.js').Transport} transport */
export function seoFilesApi(transport) {
	return {
		async getRobotsTxt({ siteId } = {}) {
			return transport.request({
				method: 'GET',
				path: '/seo/v1/robots-txt',
				scope: 'site',
				siteId,
			});
		},

		/** @param {{ content: string, siteId?: string }} input */
		async updateRobotsTxt({ content, siteId }) {
			return transport.request({
				method: 'PUT',
				path: '/seo/v1/robots-txt',
				scope: 'site',
				siteId,
				body: { robotsTxt: { content } },
			});
		},

		async getLlmsTxt({ siteId } = {}) {
			return transport.request({
				method: 'GET',
				path: '/seo/v1/llms-txt',
				scope: 'site',
				siteId,
			});
		},

		/** @param {{ content: string, siteId?: string }} input */
		async updateLlmsTxt({ content, siteId }) {
			return transport.request({
				method: 'PUT',
				path: '/seo/v1/llms-txt',
				scope: 'site',
				siteId,
				body: { llmsTxt: { content } },
			});
		},
	};
}
