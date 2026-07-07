// Site Media (Media Manager) — the fully API-supported half of image work.
//
// Flow: generate-upload-url → PUT bytes to the signed URL → poll file-ready.
// Files are NOT usable immediately after upload (async "file ready"), so every
// media step ends with a poll-before-reference loop. Placement into editor
// elements is the editor plane's job (mediaPicker flow / agent).

import { WixApiError } from './errors.js';

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** States that mean "the file is usable". Wix reports READY on file descriptors. */
const READY_STATES = new Set(['READY', 'OK', 'AVAILABLE']);

export function isFileReady(file) {
	if (!file || typeof file !== 'object') return false;
	const state = file.operationStatus ?? file.state ?? file.status;
	return typeof state === 'string' && READY_STATES.has(state.toUpperCase());
}

/** @param {import('./transport.js').Transport} transport */
export function mediaApi(transport, { sleep = defaultSleep } = {}) {
	const api = {
		/**
		 * Step 1: get a signed upload URL.
		 * @param {{ mimeType: string, fileName?: string, filePath?: string,
		 *           parentFolderId?: string, sizeInBytes?: number,
		 *           private?: boolean, labels?: string[], siteId?: string }} input
		 */
		async generateUploadUrl({ siteId, ...body }) {
			if (!body.mimeType) {
				throw new WixApiError('validation', 'generateUploadUrl requires mimeType');
			}
			return transport.request({
				method: 'POST',
				path: '/site-media/v1/files/generate-upload-url',
				scope: 'site',
				siteId,
				body,
			});
		},

		/**
		 * Step 2: PUT the raw bytes to the signed URL (no auth headers — the
		 * URL itself is the credential). Returns the created file descriptor.
		 * @param {{ uploadUrl: string, bytes: Uint8Array|string, mimeType: string, fileName?: string }} input
		 */
		async putBytes({ uploadUrl, bytes, mimeType, fileName }) {
			return transport.request({
				method: 'PUT',
				path: uploadUrl,
				query: fileName ? { filename: fileName } : undefined,
				rawBody: bytes,
				headers: { 'Content-Type': mimeType },
			});
		},

		/**
		 * Server-side import from a public URL — recommended for pipeline
		 * assets already hosted somewhere fetchable.
		 * @param {{ url: string, mimeType?: string, fileName?: string, parentFolderId?: string, siteId?: string }} input
		 */
		async importFile({ siteId, ...body }) {
			return transport.request({
				method: 'POST',
				path: '/site-media/v1/files/import',
				scope: 'site',
				siteId,
				body,
			});
		},

		/**
		 * Fetch a file descriptor (used by the file-ready poll).
		 * @param {{ fileId: string, siteId?: string }} input
		 */
		async getFile({ fileId, siteId }) {
			return transport.request({
				method: 'GET',
				path: `/site-media/v1/files/${encodeURIComponent(fileId)}`,
				scope: 'site',
				siteId,
			});
		},

		/**
		 * Step 3: poll until the uploaded file is usable.
		 * @param {{ fileId: string, siteId?: string, pollMs?: number, timeoutMs?: number }} input
		 */
		async waitForFileReady({ fileId, siteId, pollMs = 2_000, timeoutMs = 120_000 }) {
			let elapsed = 0;
			for (;;) {
				const result = await api.getFile({ fileId, siteId });
				const file = result?.file ?? result;
				if (isFileReady(file)) return file;
				if (elapsed >= timeoutMs) {
					throw new WixApiError('unknown', `Media file ${fileId} not ready after ${timeoutMs}ms`, {
						details: file,
					});
				}
				await sleep(pollMs);
				elapsed += pollMs;
			}
		},

		/**
		 * Convenience: full upload pipeline (generate URL → PUT → poll ready).
		 * @param {{ bytes: Uint8Array|string, mimeType: string, fileName?: string,
		 *           filePath?: string, parentFolderId?: string, labels?: string[],
		 *           siteId?: string, pollMs?: number, timeoutMs?: number }} input
		 * @returns {Promise<object>} the ready file descriptor
		 */
		async uploadFile({ bytes, mimeType, fileName, filePath, parentFolderId, labels, siteId, pollMs, timeoutMs }) {
			const { uploadUrl } = await api.generateUploadUrl({
				mimeType,
				fileName,
				filePath,
				parentFolderId,
				labels,
				sizeInBytes: typeof bytes === 'string' ? undefined : bytes?.byteLength,
				siteId,
			});
			const uploaded = await api.putBytes({ uploadUrl, bytes, mimeType, fileName });
			const file = uploaded?.file ?? uploaded;
			const fileId = file?.id;
			if (!fileId) return file; // some responses inline the ready descriptor
			return api.waitForFileReady({ fileId, siteId, pollMs, timeoutMs });
		},
	};
	return api;
}
