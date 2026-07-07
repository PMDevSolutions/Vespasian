// Op registry — maps BuildPlan step ops onto the pluggable transports.
//
// ctx = { rest, cli, editor, state } where:
//   rest    a createRestClient() instance (live or dry-run)
//   cli     a createCliChannel() instance
//   editor  optional editor driver: { runFlow(op, input) } — absent in
//           dry-run/CI, in which case editor steps become pending-agent
//   state   mutable run state (siteId, uploaded files, ...)

import { readFile } from 'node:fs/promises';

import { assertEditorType } from '../rest/editorUrls.js';

export const API_OPS = {
	'site.create': async (ctx, input) => {
		const result = await ctx.rest.projects.createSite(input);
		const project = result?.project ?? result;
		if (project?.siteId) ctx.state.siteId = project.siteId;
		if (project?.metaSiteId) ctx.state.metaSiteId = project.metaSiteId;
		return result;
	},

	'site.assertStudio': async (ctx) => {
		const result = await ctx.rest.editorUrls.getEditorUrls({ siteId: ctx.state.siteId });
		assertEditorType(result, 'WIX_STUDIO');
		ctx.state.editorUrl = result.editorUrl ?? result.editorUrls?.[0]?.editorUrl;
		return result;
	},

	'site.duplicate': (ctx, input) => ctx.rest.siteActions.duplicateSite(input),

	'media.upload': async (ctx, input) => {
		let bytes = null;
		if (input.path) {
			bytes = await readFile(input.path).catch(() => null);
		}
		if (bytes === null && input.url) {
			// Server-side import — recommended for URL-hosted pipeline assets.
			const imported = await ctx.rest.media.importFile({
				url: input.url,
				mimeType: input.mimeType,
				fileName: input.fileName,
			});
			const file = imported?.file ?? imported;
			ctx.state.files = ctx.state.files ?? {};
			ctx.state.files[input.slug] = file;
			return file;
		}
		if (bytes === null) {
			if (!ctx.rest?.dryRun) {
				// Live mode NEVER uploads empty placeholders — fail the step so
				// its onFail semantics surface the unreadable asset.
				throw new Error(
					`media.upload: could not read "${input.path ?? '(no path)'}" for slug "${input.slug}" and no url fallback — ` +
						'refusing to upload an empty file (run apply from the directory the plan was compiled in, or re-stage assets)',
				);
			}
			// Dry-run fixtures may reference files that don't exist locally.
			bytes = new Uint8Array(0);
		}
		const file = await ctx.rest.media.uploadFile({
			bytes,
			mimeType: input.mimeType,
			fileName: input.fileName,
			siteId: ctx.state.siteId,
		});
		ctx.state.files = ctx.state.files ?? {};
		ctx.state.files[input.slug] = file;
		return file;
	},

	'data.createCollection': (ctx, input) =>
		ctx.rest.data.createCollection({ ...input, siteId: ctx.state.siteId }),

	'data.bulkInsertItems': (ctx, input) =>
		ctx.rest.data.bulkInsertItems({ ...input, siteId: ctx.state.siteId }),

	'embeds.create': (ctx, input) => ctx.rest.embeds.createEmbed({ ...input, siteId: ctx.state.siteId }),

	'properties.updateBusinessProfile': (ctx, input) =>
		ctx.rest.properties.updateBusinessProfile({ ...input, siteId: ctx.state.siteId }),

	'seoFiles.updateRobotsTxt': (ctx, input) =>
		ctx.rest.seoFiles.updateRobotsTxt({ ...input, siteId: ctx.state.siteId }),

	'seoFiles.updateLlmsTxt': (ctx, input) =>
		ctx.rest.seoFiles.updateLlmsTxt({ ...input, siteId: ctx.state.siteId }),

	'site.publish': (ctx) => ctx.rest.siteActions.publishSite({ siteId: ctx.state.siteId }),
};

export const CLI_OPS = {
	'cli.writeGlobalCss': (ctx, input) => ctx.cli.writeGlobalCss(input),
	'cli.writeVeloFile': (ctx, input) => ctx.cli.writeVeloFile(input),
	'cli.push': (ctx, input) => ctx.cli.push(input),
	'cli.publish': (ctx, input) => ctx.cli.publish(input),
};

/**
 * Resolve the handler for a step. Editor ('playwright'/'agent') and qa ops go
 * through the editor driver's runFlow when one is attached; otherwise the
 * executor turns them into pending-agent entries.
 */
export function handlerFor(step) {
	if (step.method === 'api') return API_OPS[step.op] ?? null;
	if (step.method === 'cli') return CLI_OPS[step.op] ?? null;
	return null; // playwright/agent: dispatched via ctx.editor by the runner
}
