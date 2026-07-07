// Custom Embeds — the site-owner-key-compatible code injection channel.
//
// POST/GET/PATCH/DELETE /embeds/v1/custom-embeds
//   position ∈ { HEAD, BODY_START, BODY_END }; html ≤ 15,000 chars;
//   revision-based updates (409 on stale revision);
//   per-site embed count limit (429 SITE_EMBEDS_LIMIT_EXCEEDED).
//
// The app-management Embedded Scripts API is deliberately NOT used: it
// requires authenticating as a Wix app — wrong tool for a site-owner CLI.

import { WixApiError } from './errors.js';
import { revisionAwareUpdate } from './transport.js';

export const EMBED_HTML_MAX_CHARS = 15_000;

function guardHtml(html) {
	if (typeof html !== 'string' || html.length === 0) {
		throw new WixApiError('validation', 'Custom embed html must be a non-empty string');
	}
	if (html.length > EMBED_HTML_MAX_CHARS) {
		throw new WixApiError(
			'validation',
			`Custom embed html is ${html.length} chars — Wix caps embeds at ${EMBED_HTML_MAX_CHARS}. ` +
				'Large generated CSS belongs in global.css via the CLI channel instead.',
		);
	}
}

/** @param {import('./transport.js').Transport} transport */
export function embedsApi(transport) {
	const api = {
		/**
		 * Create a custom embed.
		 * @param {{ name: string, position: 'HEAD'|'BODY_START'|'BODY_END',
		 *           html: string, category?: string, enabled?: boolean,
		 *           loadOnce?: boolean, pageIds?: string[], siteId?: string }} input
		 */
		async createEmbed({ name, position, html, category = 'ESSENTIAL', enabled = true, loadOnce, pageIds, siteId }) {
			guardHtml(html);
			const customEmbed = {
				name,
				position,
				enabled,
				embedData: { category, html },
			};
			if (loadOnce !== undefined) customEmbed.loadOnce = loadOnce;
			if (pageIds && pageIds.length > 0) customEmbed.pageFilter = { pageIds };
			return transport.request({
				method: 'POST',
				path: '/embeds/v1/custom-embeds',
				scope: 'site',
				siteId,
				body: { customEmbed },
			});
		},

		/** List custom embeds. */
		async listEmbeds({ siteId } = {}) {
			return transport.request({
				method: 'GET',
				path: '/embeds/v1/custom-embeds',
				scope: 'site',
				siteId,
			});
		},

		/** Get one custom embed by id. */
		async getEmbed({ embedId, siteId }) {
			return transport.request({
				method: 'GET',
				path: `/embeds/v1/custom-embeds/${encodeURIComponent(embedId)}`,
				scope: 'site',
				siteId,
			});
		},

		/**
		 * Raw update — caller supplies the current revision.
		 * @param {{ embedId: string, revision: string|number, patch: object, siteId?: string }} input
		 */
		async updateEmbed({ embedId, revision, patch, siteId }) {
			if (patch?.embedData?.html !== undefined) guardHtml(patch.embedData.html);
			return transport.request({
				method: 'PATCH',
				path: `/embeds/v1/custom-embeds/${encodeURIComponent(embedId)}`,
				scope: 'site',
				siteId,
				body: { customEmbed: { ...patch, id: embedId, revision } },
			});
		},

		/**
		 * Revision-aware update: fetches the current revision and retries once
		 * on a 409 conflict.
		 */
		async updateEmbedSafe({ embedId, patch, siteId }) {
			return revisionAwareUpdate({
				fetchCurrent: async () => {
					const result = await api.getEmbed({ embedId, siteId });
					return result?.customEmbed ?? result;
				},
				applyUpdate: (current) =>
					api.updateEmbed({ embedId, revision: current.revision, patch, siteId }),
			});
		},

		/** Delete a custom embed. */
		async deleteEmbed({ embedId, siteId }) {
			return transport.request({
				method: 'DELETE',
				path: `/embeds/v1/custom-embeds/${encodeURIComponent(embedId)}`,
				scope: 'site',
				siteId,
			});
		},
	};
	return api;
}
