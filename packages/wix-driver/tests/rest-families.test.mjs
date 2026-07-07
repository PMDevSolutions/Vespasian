// REST families: each module must build the correct request shape
// (method, path, scope, body) against a capture transport. No network.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { projectsApi } from '../src/rest/projects.js';
import { siteActionsApi } from '../src/rest/siteActions.js';
import { sitesApi } from '../src/rest/sites.js';
import { editorUrlsApi, assertEditorType } from '../src/rest/editorUrls.js';
import { mediaApi } from '../src/rest/media.js';
import { dataApi } from '../src/rest/data.js';
import { embedsApi, EMBED_HTML_MAX_CHARS } from '../src/rest/embeds.js';
import { propertiesApi } from '../src/rest/properties.js';
import { seoFilesApi } from '../src/rest/seoFiles.js';
import { WixApiError } from '../src/rest/errors.js';

function captureTransport(respond = () => ({})) {
	const calls = [];
	return {
		calls,
		context: {},
		request: async (req) => {
			calls.push(req);
			return respond(req);
		},
	};
}

test('projects.createSite → POST /funnel/projects/v1/create (account scope, type WIX)', async () => {
	const t = captureTransport();
	await projectsApi(t).createSite({ name: 'My Site', templateId: 'tpl-1' });
	assert.deepEqual(t.calls[0], {
		method: 'POST',
		path: '/funnel/projects/v1/create',
		scope: 'account',
		body: { type: 'WIX', name: 'My Site', templateId: 'tpl-1' },
	});
});

test('siteActions.duplicateSite / publishSite build correct requests', async () => {
	const t = captureTransport();
	const api = siteActionsApi(t);
	await api.duplicateSite({ sourceSiteId: 'src-1', siteDisplayName: 'Copy' });
	await api.publishSite({ siteId: 'site-9' });

	assert.equal(t.calls[0].path, '/site-actions/v1/sites/duplicate');
	assert.equal(t.calls[0].scope, 'account');
	assert.deepEqual(t.calls[0].body, { sourceSiteId: 'src-1', siteDisplayName: 'Copy' });

	assert.equal(t.calls[1].path, '/site-publisher/v1/site/publish');
	assert.equal(t.calls[1].scope, 'site');
	assert.equal(t.calls[1].siteId, 'site-9');
	assert.deepEqual(t.calls[1].body, {});
});

test('sites.querySites → POST /site-list/v2/sites/query (account scope)', async () => {
	const t = captureTransport(() => ({ sites: [] }));
	await sitesApi(t).querySites({ filter: { name: { $eq: 'x' } } });
	assert.equal(t.calls[0].method, 'POST');
	assert.equal(t.calls[0].path, '/site-list/v2/sites/query');
	assert.equal(t.calls[0].scope, 'account');
});

test('editorUrls.getEditorUrls → GET /editor-urls/v2/editor-urls; assertEditorType enforces Studio', async () => {
	const t = captureTransport(() => ({ editorType: 'WIX_EDITOR' }));
	const api = editorUrlsApi(t);
	const result = await api.getEditorUrls({ siteId: 's1' });
	assert.equal(t.calls[0].method, 'GET');
	assert.equal(t.calls[0].path, '/editor-urls/v2/editor-urls');
	assert.equal(t.calls[0].scope, 'site');

	assert.throws(
		() => assertEditorType(result, 'WIX_STUDIO'),
		(error) => error instanceof WixApiError && error.kind === 'validation' && /WIX_EDITOR/.test(error.message),
	);
	assert.equal(assertEditorType({ editorType: 'WIX_STUDIO' }).editorType, 'WIX_STUDIO');
});

test('media upload pipeline: generate-upload-url → PUT bytes → poll file-ready', async () => {
	const t = captureTransport((req) => {
		if (req.path.endsWith('/generate-upload-url')) return { uploadUrl: 'https://upload.wixmp.com/u/1' };
		if (req.method === 'PUT') return { file: { id: 'f-1', operationStatus: 'PENDING' } };
		return { file: { id: 'f-1', operationStatus: 'READY' } };
	});
	const api = mediaApi(t, { sleep: async () => {} });
	const file = await api.uploadFile({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png', fileName: 'a.png' });

	assert.equal(file.operationStatus, 'READY');
	assert.equal(t.calls[0].path, '/site-media/v1/files/generate-upload-url');
	assert.equal(t.calls[0].body.mimeType, 'image/png');
	assert.equal(t.calls[0].body.sizeInBytes, 3);
	// PUT goes to the signed absolute URL with raw bytes + filename query.
	assert.equal(t.calls[1].method, 'PUT');
	assert.equal(t.calls[1].path, 'https://upload.wixmp.com/u/1');
	assert.deepEqual(t.calls[1].query, { filename: 'a.png' });
	assert.ok(t.calls[1].rawBody instanceof Uint8Array);
	// Poll hits GET /files/{id}.
	assert.equal(t.calls[2].method, 'GET');
	assert.equal(t.calls[2].path, '/site-media/v1/files/f-1');
});

test('media.generateUploadUrl requires mimeType', async () => {
	const api = mediaApi(captureTransport());
	await assert.rejects(
		() => api.generateUploadUrl({ fileName: 'x.png' }),
		(error) => error instanceof WixApiError && error.kind === 'validation',
	);
});

test('data: createCollection defaults permissions; bulkInsertItems hits /bulk/items/insert', async () => {
	const t = captureTransport();
	const api = dataApi(t);
	await api.createCollection({ collection: { id: 'posts', fields: [{ key: 'title', type: 'TEXT' }] } });
	await api.bulkInsertItems({ dataCollectionId: 'posts', dataItems: [{ data: { title: 'Hi' } }] });

	assert.equal(t.calls[0].path, '/wix-data/v2/collections');
	assert.deepEqual(t.calls[0].body.collection.permissions, {
		insert: 'ADMIN',
		update: 'ADMIN',
		remove: 'ADMIN',
		read: 'ANYONE',
	});
	assert.equal(t.calls[1].path, '/wix-data/v2/bulk/items/insert');
	assert.equal(t.calls[1].body.dataItems.length, 1);
});

test('data.createCollection rejects a collection without fields', async () => {
	const api = dataApi(captureTransport());
	await assert.rejects(
		() => api.createCollection({ collection: { id: 'empty', fields: [] } }),
		(error) => error instanceof WixApiError && error.kind === 'validation',
	);
});

test('embeds: 15k html guard + revision-aware update on 409', async () => {
	const t = captureTransport((req) => {
		if (req.method === 'GET') return { customEmbed: { id: 'e1', revision: '7' } };
		return { customEmbed: { id: 'e1', revision: '8' } };
	});
	const api = embedsApi(t);

	await assert.rejects(
		() => api.createEmbed({ name: 'big', position: 'HEAD', html: 'x'.repeat(EMBED_HTML_MAX_CHARS + 1) }),
		(error) => error instanceof WixApiError && error.kind === 'validation' && /15,?000|15000/.test(error.message),
	);

	await api.createEmbed({ name: 'ga', position: 'HEAD', html: '<script>1</script>', pageIds: ['p1'] });
	assert.equal(t.calls[0].path, '/embeds/v1/custom-embeds');
	assert.equal(t.calls[0].body.customEmbed.position, 'HEAD');
	assert.equal(t.calls[0].body.customEmbed.embedData.category, 'ESSENTIAL');
	assert.deepEqual(t.calls[0].body.customEmbed.pageFilter, { pageIds: ['p1'] });

	await api.updateEmbedSafe({ embedId: 'e1', patch: { name: 'renamed' } });
	const patchCall = t.calls.find((c) => c.method === 'PATCH');
	assert.equal(patchCall.body.customEmbed.revision, '7'); // revision from the GET
});

test('properties.updateBusinessProfile derives the fields mask from provided keys', async () => {
	const t = captureTransport();
	await propertiesApi(t).updateBusinessProfile({ profile: { siteDisplayName: 'New Name' } });
	assert.equal(t.calls[0].path, '/site-properties/v4/properties/business-profile');
	assert.deepEqual(t.calls[0].body.fields, { paths: ['siteDisplayName'] });
	assert.equal(t.calls[0].body.siteDisplayName, 'New Name');
});

test('seoFiles: robots/llms get + update', async () => {
	const t = captureTransport();
	const api = seoFilesApi(t);
	await api.getRobotsTxt();
	await api.updateRobotsTxt({ content: 'User-agent: *' });
	await api.updateLlmsTxt({ content: '# hello' });
	assert.equal(t.calls[0].method, 'GET');
	assert.equal(t.calls[0].path, '/seo/v1/robots-txt');
	assert.equal(t.calls[1].method, 'PUT');
	assert.deepEqual(t.calls[1].body, { robotsTxt: { content: 'User-agent: *' } });
	assert.equal(t.calls[2].path, '/seo/v1/llms-txt');
});
