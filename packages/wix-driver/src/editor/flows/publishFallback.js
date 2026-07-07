// Flow: publish via the editor UI — LAST-RESORT fallback only.
// The primary publish path is the REST Site Publisher API (siteActions), or
// `wix publish` when Git-connected code changed. This flow exists for the rare
// case where both are unavailable. Verify by fetching the published URL, never
// by trusting the success modal.

import { tryStep } from '../escalation.js';
import { firstMatch, selectorCandidates } from './shared.js';

/**
 * @param {import('playwright').Page} page
 */
export async function publishFallback(page, _input = {}, opts = {}) {
	return tryStep(
		{
			flow: 'publishFallback',
			step: 'publish-button',
			hint: 'Click the Publish button (top-right); handle the Studio code-validation dialog (Continue) and dismiss the success modal. Prefer the REST publish instead.',
			page,
			...opts,
		},
		async () => {
			await firstMatch(page, selectorCandidates('publish-button', ['[data-hook="topbar-publish"]', 'button:has-text("Publish")'], opts), {
				action: 'click',
			});
			// Studio publish-with-code triggers a validation dialog: continue.
			const continueBtn = page.locator('button:has-text("Continue"), [data-hook="publish-anyway"]').first();
			if (await continueBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
				await continueBtn.click();
			}
			// Dismiss the success modal.
			const close = page.locator('[data-hook="baseModalLayout-close-button"]').first();
			if (await close.isVisible({ timeout: 15_000 }).catch(() => false)) {
				await close.click();
			}
			return { ok: true, note: 'Verify by fetching the published URL (qa/capture), not the modal.' };
		},
	);
}
