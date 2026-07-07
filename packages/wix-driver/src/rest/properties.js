// Site Properties — display name, business profile, contact.
//
// GET  /site-properties/v4/properties
// POST /site-properties/v4/properties/business-profile
//
// ⚠ fields-mask semantics: fields listed in `fields.paths` but omitted from
// the payload are CLEARED on the site. updateBusinessProfile derives the mask
// from the keys actually present so callers cannot accidentally wipe fields.

/** @param {import('./transport.js').Transport} transport */
export function propertiesApi(transport) {
	return {
		/** Read site/business properties (includes read-only locale). */
		async getProperties({ siteId } = {}) {
			return transport.request({
				method: 'GET',
				path: '/site-properties/v4/properties',
				scope: 'site',
				siteId,
			});
		},

		/**
		 * Update the business profile. The fields mask is derived from the
		 * provided keys unless an explicit `paths` array is passed.
		 * @param {{ profile: { siteDisplayName?: string, businessName?: string,
		 *           logo?: string, description?: string }, paths?: string[], siteId?: string }} input
		 */
		async updateBusinessProfile({ profile, paths, siteId }) {
			const effectivePaths = paths ?? Object.keys(profile ?? {}).sort();
			return transport.request({
				method: 'POST',
				path: '/site-properties/v4/properties/business-profile',
				scope: 'site',
				siteId,
				body: {
					...profile,
					fields: { paths: effectivePaths },
				},
			});
		},
	};
}
