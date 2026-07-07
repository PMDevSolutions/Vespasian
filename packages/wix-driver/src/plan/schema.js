// BuildPlan schema — the contract between the design pipeline and the Wix
// output layer (Vespasian's analog of Flavian's generated theme files).
// Serializable, diffable, resumable.

import { z } from 'zod';

import { FidelityNoteSchema } from '../translate/schemas.js';

export const PHASES = ['provision', 'media', 'data', 'editor', 'code', 'properties', 'publish', 'qa'];

export const StepMethod = z.enum(['api', 'cli', 'playwright', 'agent']);
export const StepPhase = z.enum(PHASES);
export const StepOnFail = z.enum(['retry', 'escalate', 'skip-and-report']);

export const StepVerify = z
	.object({
		assert: z.string().min(1),
		equals: z.unknown().optional(),
	})
	.passthrough();

export const BuildStepSchema = z.object({
	id: z.string().min(1),
	op: z.string().min(1),
	method: StepMethod,
	phase: StepPhase,
	input: z.unknown(),
	idempotencyKey: z.string().min(1),
	verify: StepVerify.optional(),
	onFail: StepOnFail,
});

export const BuildPlanSchema = z.object({
	planVersion: z.literal(1),
	site: z.object({
		title: z.string().min(1),
		templateId: z.string().optional(),
	}),
	steps: z.array(BuildStepSchema),
	fidelity: z.array(FidelityNoteSchema),
	meta: z.object({
		sourceHash: z.string().min(1),
	}),
});

/** @typedef {z.infer<typeof BuildStepSchema>} BuildStep */
/** @typedef {z.infer<typeof BuildPlanSchema>} BuildPlan */

// ---- Tolerant input schemas (plain parsed JSON artifacts, no pipeline imports) ----

/** Design IR — accepted loosely; the compiler only reads a few fields. */
export const IrInputSchema = z
	.object({
		source: z.unknown().optional(),
		pages: z.array(z.unknown()).optional(),
		spreads: z.array(z.unknown()).optional(),
	})
	.passthrough();

export const ContentBlockSchema = z
	.object({
		type: z.string().min(1), // 'text' | 'image' | 'button' | ...
		text: z.string().optional(),
		assetSlug: z.string().optional(),
		href: z.string().optional(),
		bounds: z
			.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
			.partial()
			.optional(),
		style: z.record(z.unknown()).optional(),
	})
	.passthrough();

export const ContentSectionSchema = z
	.object({
		id: z.string().optional(),
		name: z.string().optional(),
		blocks: z.array(ContentBlockSchema).default([]),
	})
	.passthrough();

export const ContentPageSchema = z
	.object({
		id: z.string().optional(),
		title: z.string().optional(),
		name: z.string().optional(),
		seo: z.object({ title: z.string().optional(), description: z.string().optional() }).partial().optional(),
		sections: z.array(ContentSectionSchema).default([]),
	})
	.passthrough();

export const ContentInputSchema = z
	.object({
		pages: z.array(ContentPageSchema).default([]),
		collections: z
			.array(
				z
					.object({
						id: z.string().min(1),
						fields: z.array(z.object({ key: z.string(), type: z.string() }).passthrough()).default([]),
						items: z.array(z.record(z.unknown())).default([]),
					})
					.passthrough(),
			)
			.default([]),
	})
	.passthrough();

export const AssetsManifestSchema = z
	.object({
		assets: z
			.array(
				z
					.object({
						slug: z.string().min(1),
						path: z.string().optional(),
						url: z.string().optional(),
						mimeType: z.string().default('image/png'),
						fileName: z.string().optional(),
					})
					.passthrough(),
			)
			.default([]),
	})
	.passthrough();
