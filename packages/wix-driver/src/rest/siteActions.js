// Site Actions — duplicate + publish.
//
// Duplicate: POST /site-actions/v1/sites/duplicate  (account-level)
//   Clones custom embeds, excludes business data; the copy starts un-Premium.
// Publish:   POST /site-publisher/v1/site/publish    (site-level, empty body)
//   Documented scope is (oddly) SCOPE.PROMOTE.MANAGE-SEO. A 428 means the site
//   has neither a template nor a headless structure (nothing to publish).

/** @param {import('./transport.js').Transport} transport */
export function siteActionsApi(transport) {
	return {
		/**
		 * Duplicate an existing site as a starting point.
		 * @param {{ sourceSiteId: string, siteDisplayName: string }} input
		 */
		async duplicateSite({ sourceSiteId, siteDisplayName }) {
			return transport.request({
				method: 'POST',
				path: '/site-actions/v1/sites/duplicate',
				scope: 'account',
				body: { sourceSiteId, siteDisplayName },
			});
		},

		/**
		 * Publish the current editor state of a site. REST publish ships editor
		 * content only; when Git-connected code changed, `wix publish` (CLI
		 * channel) is the correct path instead.
		 * @param {{ siteId?: string }} [input]
		 */
		async publishSite({ siteId } = {}) {
			return transport.request({
				method: 'POST',
				path: '/site-publisher/v1/site/publish',
				scope: 'site',
				siteId,
				body: {},
			});
		},
	};
}
