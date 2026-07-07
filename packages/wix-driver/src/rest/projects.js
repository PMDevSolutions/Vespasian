// Projects API — the site provisioning primitive.
//
// POST https://www.wixapis.com/funnel/projects/v1/create  (account-level)
//   { type: 'WIX', name, templateId?, folderId?, apps? }
//   → { project: { siteId, metaSiteId, ... } }
//
// Template selection at creation time is the ONLY official way to obtain a
// designed page structure programmatically — templateId is the layout seed.

/** @param {import('./transport.js').Transport} transport */
export function projectsApi(transport) {
	return {
		/**
		 * Create a new Wix site (blank or from a template).
		 * @param {{ name: string, templateId?: string, folderId?: string, apps?: string[], type?: string }} input
		 */
		async createSite({ name, templateId, folderId, apps, type = 'WIX' }) {
			const body = { type, name };
			if (templateId) body.templateId = templateId;
			if (folderId) body.folderId = folderId;
			if (apps && apps.length > 0) body.apps = apps;
			return transport.request({
				method: 'POST',
				path: '/funnel/projects/v1/create',
				scope: 'account',
				body,
			});
		},
	};
}
