// Tolerant zod schemas for the token input (the pipeline mapTokens output
// shape) and the FidelityNote record.
//
// IMPORTANT: this package never imports @vespasian/pipeline — tokens arrive
// as plain parsed JSON (tokens.json on disk) and are validated tolerantly
// here: unknown fields pass through, both the flat shape and a theme.json-
// style `settings` wrapper are accepted.

import { z } from 'zod';

export const PaletteEntry = z
	.object({
		slug: z.string().min(1),
		color: z.string().min(1),
		name: z.string().optional(),
	})
	.passthrough();

export const FontSizeEntry = z
	.object({
		slug: z.string().min(1),
		size: z.union([z.string(), z.number()]),
		name: z.string().optional(),
	})
	.passthrough();

export const FontFamilyEntry = z
	.object({
		slug: z.string().min(1),
		name: z.string().optional(),
		fontFamily: z.string().min(1),
	})
	.passthrough();

export const SpacingEntry = z
	.object({
		slug: z.string().min(1),
		size: z.union([z.string(), z.number()]),
		name: z.string().optional(),
	})
	.passthrough();

export const TokensSchema = z
	.object({
		palette: z.array(PaletteEntry).default([]),
		fontSizes: z.array(FontSizeEntry).default([]),
		fontFamilies: z.array(FontFamilyEntry).default([]),
		spacingSizes: z.array(SpacingEntry).default([]),
	})
	.passthrough();

/**
 * Accept either the flat mapTokens shape or a theme.json-style partial
 * ({ settings: { color: { palette }, typography: {...}, spacing: {...} } })
 * and normalize to the flat shape.
 */
export function normalizeTokens(raw) {
	if (!raw || typeof raw !== 'object') return TokensSchema.parse({});
	const settings = raw.settings;
	if (settings && typeof settings === 'object') {
		return TokensSchema.parse({
			palette: settings.color?.palette ?? raw.palette ?? [],
			fontSizes: settings.typography?.fontSizes ?? raw.fontSizes ?? [],
			fontFamilies: settings.typography?.fontFamilies ?? raw.fontFamilies ?? [],
			spacingSizes: settings.spacing?.spacingSizes ?? raw.spacingSizes ?? [],
		});
	}
	return TokensSchema.parse(raw);
}

/** A recorded translation loss — the atom of the FidelityReport. */
export const FidelityNoteSchema = z.object({
	code: z.string().min(1),
	severity: z.enum(['info', 'warn', 'error']),
	message: z.string().min(1),
	context: z.unknown().optional(),
});

/** @typedef {z.infer<typeof FidelityNoteSchema>} FidelityNote */

export function note(code, severity, message, context) {
	return FidelityNoteSchema.parse({ code, severity, message, ...(context !== undefined ? { context } : {}) });
}
