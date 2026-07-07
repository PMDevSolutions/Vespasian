// BuildPlan compiler: plain parsed JSON artifacts in → zod-validated,
// deterministic BuildPlan out.
//
// Inputs (all file-shaped; NEVER live @vespasian/pipeline imports):
//   ir       ir.json               design IR (tolerated loosely)
//   content  content.json          semantic content model (optional)
//   tokens   tokens.json           mapTokens output shape
//   assets   assets.manifest.json  staged asset list (optional)
//
// Channel routing per step follows the operations matrix (docs/wix/API-COVERAGE.md):
//   api        provisioning, media, CMS data, embeds, properties, publish
//   playwright deterministic panel flows (theme colors/typography, per-page SEO)
//   agent      canvas composition (sections, text, images) — screenshot-grounded
//   cli        global.css / Velo push (after the editor phase)
//
// Determinism: no timestamps, no randomness; ids derive from ordinals and
// slugs; idempotency keys and meta.sourceHash from stable-stringified inputs.
//
// step.verify semantics: the executor evaluates 'file-ready' itself (polling
// the media transport) and 'editorType' is enforced inside the op handler;
// every other assert (published-url-reachable, wst-color-vars, wst-font-vars)
// is an advisory instruction for the QA phase / wix-site-builder agent, which
// the executor surfaces as a fidelity note rather than silently ignoring.

import { translateTokens } from '../translate/index.js';
import { hashValue, idempotencyKey } from './hash.js';
import {
	AssetsManifestSchema,
	BuildPlanSchema,
	ContentInputSchema,
	IrInputSchema,
} from './schema.js';

function step({ id, op, method, phase, input, verify, onFail }) {
	return {
		id,
		op,
		method,
		phase,
		input,
		idempotencyKey: idempotencyKey(op, input),
		...(verify ? { verify } : {}),
		onFail: onFail ?? (method === 'api' || method === 'cli' ? 'retry' : 'escalate'),
	};
}

/**
 * Compile a BuildPlan.
 *
 * @param {Object} artifacts
 * @param {object} [artifacts.ir]       Parsed ir.json.
 * @param {object} [artifacts.content]  Parsed content.json.
 * @param {object} artifacts.tokens     Parsed tokens.json.
 * @param {object} [artifacts.assets]   Parsed assets.manifest.json.
 * @param {Object} [options]
 * @param {string} [options.siteTitle]   Site display name (default: derived).
 * @param {string} [options.templateId]  Confirmed-Studio template GUID seed.
 * @returns {import('./schema.js').BuildPlan}
 */
export function compilePlan(artifacts, options = {}) {
	const ir = IrInputSchema.parse(artifacts.ir ?? {});
	const content = ContentInputSchema.parse(artifacts.content ?? {});
	const assets = AssetsManifestSchema.parse(artifacts.assets ?? {});
	const { themePlan, globalCss, fidelity } = translateTokens(artifacts.tokens ?? {});

	const siteTitle =
		options.siteTitle ??
		content.pages[0]?.title ??
		(typeof ir.source === 'object' && ir.source?.name ? String(ir.source.name) : 'Vespasian Site');

	const site = { title: siteTitle, ...(options.templateId ? { templateId: options.templateId } : {}) };
	const steps = [];

	// ---- Phase 1: provision (API) ----
	steps.push(
		step({
			id: 'provision-create-site',
			op: 'site.create',
			method: 'api',
			phase: 'provision',
			input: { name: siteTitle, ...(options.templateId ? { templateId: options.templateId } : {}) },
		}),
		step({
			id: 'provision-assert-studio',
			op: 'site.assertStudio',
			method: 'api',
			phase: 'provision',
			input: {},
			verify: { assert: 'editorType', equals: 'WIX_STUDIO' },
			onFail: 'escalate', // wrong editor flavor is not retryable
		}),
	);

	// ---- Phase 2: media (API; upload + file-ready poll) ----
	for (const asset of assets.assets) {
		steps.push(
			step({
				id: `media-upload-${asset.slug}`,
				op: 'media.upload',
				method: 'api',
				phase: 'media',
				input: {
					slug: asset.slug,
					mimeType: asset.mimeType,
					fileName: asset.fileName ?? asset.slug,
					...(asset.path ? { path: asset.path } : {}),
					...(asset.url ? { url: asset.url } : {}),
				},
				verify: { assert: 'file-ready' },
			}),
		);
	}

	// ---- Phase 3: data (API; CMS collections + items) ----
	for (const collection of content.collections) {
		steps.push(
			step({
				id: `data-collection-${collection.id}`,
				op: 'data.createCollection',
				method: 'api',
				phase: 'data',
				input: { collection: { id: collection.id, fields: collection.fields } },
			}),
		);
		if (collection.items.length > 0) {
			steps.push(
				step({
					id: `data-items-${collection.id}`,
					op: 'data.bulkInsertItems',
					method: 'api',
					phase: 'data',
					input: {
						dataCollectionId: collection.id,
						dataItems: collection.items.map((data) => ({ data })),
					},
				}),
			);
		}
	}

	// ---- Phase 4: editor (Playwright panels + agent canvas work) ----
	if (Object.keys(themePlan.colors.roles).length > 0 && themePlan.colors.siteColors.length > 0) {
		steps.push(
			step({
				id: 'editor-theme-colors',
				op: 'editor.applyThemeColors',
				method: 'playwright',
				phase: 'editor',
				input: themePlan.colors,
				verify: { assert: 'wst-color-vars' },
			}),
		);
	}
	if (Object.keys(themePlan.typography.slots).length > 0 || themePlan.fonts.length > 0) {
		steps.push(
			step({
				id: 'editor-theme-typography',
				op: 'editor.applyThemeTypography',
				method: 'playwright',
				phase: 'editor',
				input: { slots: themePlan.typography.slots, fonts: themePlan.fonts },
				verify: { assert: 'wst-font-vars' },
			}),
		);
	}

	content.pages.forEach((page, pageIndex) => {
		const pageName = page.title ?? page.name ?? `page-${pageIndex + 1}`;
		if (pageIndex > 0) {
			// Page 1 comes with the template; extra pages are editor work.
			steps.push(
				step({
					id: `editor-page-${pageIndex + 1}`,
					op: 'editor.addPage',
					method: 'playwright',
					phase: 'editor',
					input: { name: pageName },
				}),
			);
		}
		page.sections.forEach((section, sectionIndex) => {
			const sectionId = section.id ?? section.name ?? `s${sectionIndex + 1}`;
			steps.push(
				step({
					id: `editor-section-${pageIndex + 1}-${sectionId}`,
					op: 'editor.addSection',
					method: 'agent', // canvas composition is screenshot-grounded agent work
					phase: 'editor',
					input: {
						page: pageName,
						index: sectionIndex,
						name: section.name ?? sectionId,
						styleHints: section.style ?? {},
					},
					onFail: 'escalate',
				}),
			);
			section.blocks.forEach((block, blockIndex) => {
				const blockId = `${pageIndex + 1}-${sectionId}-b${blockIndex + 1}`;
				if (block.type === 'image') {
					steps.push(
						step({
							id: `editor-image-${blockId}`,
							op: 'editor.addImage',
							method: 'agent',
							phase: 'editor',
							input: {
								page: pageName,
								section: sectionId,
								assetSlug: block.assetSlug ?? null,
								bounds: block.bounds ?? null,
								styleHints: block.style ?? {},
							},
							onFail: 'escalate',
						}),
					);
				} else if (block.type === 'button') {
					steps.push(
						step({
							id: `editor-button-${blockId}`,
							op: 'editor.addButton',
							method: 'agent',
							phase: 'editor',
							input: {
								page: pageName,
								section: sectionId,
								text: block.text ?? '',
								href: block.href ?? null,
								bounds: block.bounds ?? null,
								styleHints: block.style ?? {},
							},
							onFail: 'escalate',
						}),
					);
				} else {
					steps.push(
						step({
							id: `editor-text-${blockId}`,
							op: 'editor.addText',
							method: 'agent',
							phase: 'editor',
							input: {
								page: pageName,
								section: sectionId,
								text: block.text ?? '',
								themeSlot: block.style?.themeSlot ?? null,
								bounds: block.bounds ?? null,
								styleHints: block.style ?? {},
							},
							onFail: 'escalate',
						}),
					);
				}
			});
		});
		if (page.seo && (page.seo.title || page.seo.description)) {
			steps.push(
				step({
					id: `editor-seo-${pageIndex + 1}`,
					op: 'editor.setPageSeo',
					method: 'playwright',
					phase: 'editor',
					input: { pageName, ...page.seo },
				}),
			);
		}
	});

	// ---- Phase 5: code (CLI; only AFTER pages exist in the editor) ----
	steps.push(
		step({
			id: 'code-global-css',
			op: 'cli.writeGlobalCss',
			method: 'cli',
			phase: 'code',
			input: { css: globalCss },
		}),
	);

	// ---- Phase 6: properties & embeds (API) ----
	steps.push(
		step({
			id: 'properties-business-profile',
			op: 'properties.updateBusinessProfile',
			method: 'api',
			phase: 'properties',
			input: { profile: { siteDisplayName: siteTitle } },
		}),
	);

	// ---- Phase 7: publish (API) ----
	steps.push(
		step({
			id: 'publish-site',
			op: 'site.publish',
			method: 'api',
			phase: 'publish',
			input: {},
			verify: { assert: 'published-url-reachable' },
		}),
	);

	// ---- Phase 8: QA (screenshots + theme-var assertions → FidelityReport) ----
	steps.push(
		step({
			id: 'qa-capture',
			op: 'qa.capture',
			method: 'playwright',
			phase: 'qa',
			input: { widths: [1280, 900, 375] },
			onFail: 'skip-and-report',
		}),
		step({
			id: 'qa-assert-theme',
			op: 'qa.assertTheme',
			method: 'playwright',
			phase: 'qa',
			input: {
				expectVars: themePlan.colors.siteColors.slice(0, 6).map((c) => ({ approx: c.value })),
			},
			onFail: 'skip-and-report',
		}),
	);

	const plan = {
		planVersion: 1,
		site,
		steps,
		fidelity,
		meta: {
			sourceHash: hashValue({
				ir: artifacts.ir ?? null,
				content: artifacts.content ?? null,
				tokens: artifacts.tokens ?? null,
				assets: artifacts.assets ?? null,
				options: { siteTitle: options.siteTitle ?? null, templateId: options.templateId ?? null },
			}),
		},
	};

	return BuildPlanSchema.parse(plan);
}
