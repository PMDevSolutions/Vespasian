// Canned responses for the dry-run transport. Plausible shapes only — enough
// for the executor to complete every API phase without a network. Deterministic:
// ids are derived from a per-transport call counter, never from randomness.

function mockGuid(counter, tag) {
	// A stable, obviously-fake GUID: 00000000-0000-4000-8000-<tag+counter>.
	const tail = `${tag}${String(counter)}`.padStart(12, '0').slice(-12);
	return `00000000-0000-4000-8000-${tail}`;
}

/**
 * Ordered matcher table. First match wins. Each entry:
 *   { method, pattern: RegExp (tested against the URL), respond(req, seq) }
 */
export const FIXTURES = [
	{
		method: 'POST',
		pattern: /\/funnel\/projects\/v1\/create$/,
		respond: (req, seq) => ({
			project: {
				siteId: mockGuid(seq, '1'),
				metaSiteId: mockGuid(seq, '2'),
				name: req.body?.name ?? 'dry-run-site',
				templateId: req.body?.templateId,
			},
		}),
	},
	{
		method: 'POST',
		pattern: /\/site-actions\/v1\/sites\/duplicate$/,
		respond: (req, seq) => ({
			site: { id: mockGuid(seq, '3'), name: req.body?.siteDisplayName ?? 'dry-run-copy' },
		}),
	},
	{
		method: 'POST',
		pattern: /\/site-publisher\/v1\/site\/publish$/,
		respond: () => ({}),
	},
	{
		method: 'POST',
		pattern: /\/site-list\/v2\/sites\/query$/,
		respond: () => ({ sites: [] }),
	},
	{
		method: 'POST',
		pattern: /\/site-list\/v2\/sites\/count$/,
		respond: () => ({ count: 0 }),
	},
	{
		method: 'GET',
		pattern: /\/editor-urls\/v2\/editor-urls/,
		respond: () => ({
			editorType: 'WIX_STUDIO',
			editorUrl: 'https://editor.wix.com/studio/dry-run',
			previewUrl: 'https://editor.wix.com/studio/dry-run/preview',
		}),
	},
	{
		method: 'GET',
		pattern: /\/site-urls\/v1\/published-site-urls/,
		respond: () => ({ urls: [{ url: 'https://dry-run.wixstudio.io/site' }] }),
	},
	{
		method: 'POST',
		pattern: /\/site-media\/v1\/files\/generate-upload-url$/,
		respond: (req, seq) => ({
			uploadUrl: `https://upload.wixmp.com/dry-run/${seq}`,
		}),
	},
	{
		method: 'PUT',
		pattern: /upload\.wixmp\.com/,
		respond: (req, seq) => ({
			file: {
				id: `dryrun-file-${seq}`,
				url: `wix:image://v1/dryrun-file-${seq}/asset.png#originWidth=1024&originHeight=768`,
				operationStatus: 'READY',
			},
		}),
	},
	{
		method: 'POST',
		pattern: /\/site-media\/v1\/files\/import$/,
		respond: (req, seq) => ({
			file: { id: `dryrun-import-${seq}`, operationStatus: 'READY' },
		}),
	},
	{
		method: 'GET',
		pattern: /\/site-media\/v1\/files\//,
		respond: (req) => {
			const fileId = decodeURIComponent(req.url.split('/').pop().split('?')[0]);
			return { file: { id: fileId, operationStatus: 'READY' } };
		},
	},
	{
		method: 'POST',
		pattern: /\/wix-data\/v2\/collections$/,
		respond: (req) => ({ collection: req.body?.collection ?? {} }),
	},
	{
		method: 'POST',
		pattern: /\/wix-data\/v2\/bulk\/items\/(insert|save)$/,
		respond: (req) => ({
			results: (req.body?.dataItems ?? []).map((item, i) => ({
				itemMetadata: { id: `dryrun-item-${i}`, originalIndex: i },
				item,
			})),
		}),
	},
	{
		method: 'POST',
		pattern: /\/wix-data\/v2\/items\/query$/,
		respond: () => ({ dataItems: [] }),
	},
	{
		method: 'POST',
		pattern: /\/wix-data\/v2\/items$/,
		respond: (req, seq) => ({ dataItem: { id: `dryrun-item-${seq}`, ...req.body?.dataItem } }),
	},
	{
		method: 'POST',
		pattern: /\/embeds\/v1\/custom-embeds$/,
		respond: (req, seq) => ({
			customEmbed: { id: `dryrun-embed-${seq}`, revision: '1', ...req.body?.customEmbed },
		}),
	},
	{
		method: 'GET',
		pattern: /\/embeds\/v1\/custom-embeds\//,
		respond: (req) => ({
			customEmbed: { id: req.url.split('/').pop(), revision: '1' },
		}),
	},
	{
		method: 'GET',
		pattern: /\/embeds\/v1\/custom-embeds/,
		respond: () => ({ customEmbeds: [] }),
	},
	{
		method: 'PATCH',
		pattern: /\/embeds\/v1\/custom-embeds\//,
		respond: (req) => ({ customEmbed: { ...req.body?.customEmbed, revision: '2' } }),
	},
	{
		method: 'DELETE',
		pattern: /\/embeds\/v1\/custom-embeds\//,
		respond: () => ({}),
	},
	{
		method: 'GET',
		pattern: /\/site-properties\/v4\/properties$/,
		respond: () => ({ properties: { siteDisplayName: 'dry-run-site', locale: { languageCode: 'en' } } }),
	},
	{
		method: 'POST',
		pattern: /\/site-properties\/v4\/properties\/business-profile$/,
		respond: () => ({}),
	},
	{
		method: 'GET',
		pattern: /\/seo\/v1\/(robots|llms)-txt/,
		respond: () => ({ content: '' }),
	},
	{
		method: 'PUT',
		pattern: /\/seo\/v1\/(robots|llms)-txt/,
		respond: () => ({}),
	},
];

/** Find the canned response for a request; falls back to `{}`. */
export function cannedResponse(req, seq) {
	for (const fixture of FIXTURES) {
		if (fixture.method === req.method && fixture.pattern.test(req.url)) {
			return fixture.respond(req, seq);
		}
	}
	return {};
}
