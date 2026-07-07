// Sites API (account-level) — query/count sites, resolve name → GUID.
//
// Needed to resolve the `wix-site-id` header for all site-level calls.
// NOTE: the exact query/count paths are best-effort (the docs index them under
// account-level/sites without pinning the URL in our research corpus); the
// `/site-list/v2` prefix matches Wix's published Site List service naming.

/** @param {import('./transport.js').Transport} transport */
export function sitesApi(transport) {
	return {
		/**
		 * Query sites in the account.
		 * @param {{ filter?: object, sort?: object[], paging?: { limit?: number, offset?: number } }} [query]
		 */
		async querySites(query = {}) {
			return transport.request({
				method: 'POST',
				path: '/site-list/v2/sites/query',
				scope: 'account',
				body: { query },
			});
		},

		/** Count sites in the account. */
		async countSites(filter = {}) {
			return transport.request({
				method: 'POST',
				path: '/site-list/v2/sites/count',
				scope: 'account',
				body: { filter },
			});
		},

		/**
		 * Convenience: find a site by display name (exact match on `name`).
		 * Returns the first match or undefined.
		 */
		async findSiteByName(name) {
			const result = await this.querySites({ filter: { name: { $eq: name } } });
			const sites = result?.sites ?? [];
			return sites.find((s) => s?.name === name) ?? sites[0];
		},
	};
}
