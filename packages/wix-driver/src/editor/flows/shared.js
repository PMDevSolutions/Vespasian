// Shared plumbing for deterministic editor flows.
//
// Selector strategy: candidates are tried in order — cached selector map
// entries first (when a probe has run), then the bundled defaults (data-hooks
// observed mid-2026, treated as hints not contracts). Generous timeouts;
// failure surfaces as an EscalationRequest, never a raw throw.

import { loadSelectorMap } from '../probe.js';

/** Generous default timeout — editors bootstrap slowly (90–120s observed). */
export const FLOW_TIMEOUT_MS = 30_000;
export const EDITOR_BOOT_TIMEOUT_MS = 120_000;

/**
 * Build the candidate selector list for a logical target.
 * @param {string} logicalName  e.g. 'publish-button'
 * @param {string[]} defaults   bundled fallback selectors
 * @param {{ baseDir?: string, editorType?: string }} [opts]
 */
export function selectorCandidates(logicalName, defaults, opts = {}) {
	const cached = loadSelectorMap(opts);
	const fromCache = cached?.flowSelectors?.[logicalName];
	const list = [];
	if (Array.isArray(fromCache)) list.push(...fromCache);
	else if (typeof fromCache === 'string') list.push(fromCache);
	list.push(...defaults);
	return [...new Set(list)];
}

/**
 * Click (or fill) the first candidate selector that appears.
 * @param {import('playwright').Page|import('playwright').FrameLocator} target
 * @param {string[]} candidates
 * @param {{ action?: 'click'|'fill'|'locate', value?: string, timeoutMs?: number }} [opts]
 * @returns {Promise<{ selector: string, locator: any }>} throws if none matched
 */
export async function firstMatch(target, candidates, opts = {}) {
	const { action = 'locate', value, timeoutMs = FLOW_TIMEOUT_MS } = opts;
	const perCandidate = Math.max(2_000, Math.floor(timeoutMs / Math.max(candidates.length, 1)));
	let lastError;
	for (const selector of candidates) {
		const locator = target.locator(selector).first();
		try {
			await locator.waitFor({ state: 'visible', timeout: perCandidate });
			if (action === 'click') await locator.click({ timeout: perCandidate });
			else if (action === 'fill') await locator.fill(value ?? '', { timeout: perCandidate });
			return { selector, locator };
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError ?? new Error(`No selector matched: ${candidates.join(', ')}`);
}
