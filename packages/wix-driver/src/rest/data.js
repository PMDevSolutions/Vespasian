// Wix Data (CMS) — collections + items. Fully API-supported; the backbone of
// the template-first strategy: layout once (template), content forever via API.
//
// Caveat: BINDING a collection to a dynamic page/repeater is an editor
// operation unless the template already carries the binding.

import { WixApiError } from './errors.js';

/** @param {import('./transport.js').Transport} transport */
export function dataApi(transport) {
	return {
		/**
		 * Create a data collection.
		 * @param {{ collection: { id: string, fields: Array<{key: string, type: string}>, permissions?: object, displayName?: string }, siteId?: string }} input
		 */
		async createCollection({ collection, siteId }) {
			if (!collection?.id || !Array.isArray(collection?.fields) || collection.fields.length === 0) {
				throw new WixApiError('validation', 'createCollection requires collection.id and at least one field');
			}
			const permissions = collection.permissions ?? {
				insert: 'ADMIN',
				update: 'ADMIN',
				remove: 'ADMIN',
				read: 'ANYONE',
			};
			return transport.request({
				method: 'POST',
				path: '/wix-data/v2/collections',
				scope: 'site',
				siteId,
				body: { collection: { ...collection, permissions } },
			});
		},

		/**
		 * Insert a single item.
		 * @param {{ dataCollectionId: string, dataItem: { data: object }, siteId?: string }} input
		 */
		async insertItem({ dataCollectionId, dataItem, siteId }) {
			return transport.request({
				method: 'POST',
				path: '/wix-data/v2/items',
				scope: 'site',
				siteId,
				body: { dataCollectionId, dataItem },
			});
		},

		/**
		 * Bulk-insert items.
		 * @param {{ dataCollectionId: string, dataItems: Array<{ data: object }>, siteId?: string }} input
		 */
		async bulkInsertItems({ dataCollectionId, dataItems, siteId }) {
			return transport.request({
				method: 'POST',
				path: '/wix-data/v2/bulk/items/insert',
				scope: 'site',
				siteId,
				body: { dataCollectionId, dataItems },
			});
		},

		/**
		 * Bulk save (upsert) items.
		 * @param {{ dataCollectionId: string, dataItems: Array<{ data: object }>, siteId?: string }} input
		 */
		async bulkSaveItems({ dataCollectionId, dataItems, siteId }) {
			return transport.request({
				method: 'POST',
				path: '/wix-data/v2/bulk/items/save',
				scope: 'site',
				siteId,
				body: { dataCollectionId, dataItems },
			});
		},

		/**
		 * Query items in a collection.
		 * @param {{ dataCollectionId: string, query?: object, siteId?: string }} input
		 */
		async queryItems({ dataCollectionId, query = {}, siteId }) {
			return transport.request({
				method: 'POST',
				path: '/wix-data/v2/items/query',
				scope: 'site',
				siteId,
				body: { dataCollectionId, query },
			});
		},
	};
}
