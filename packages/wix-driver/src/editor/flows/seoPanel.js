// Flow: per-page SEO (title + meta description) via the page SEO panel.
// Genuine API gap: REST covers only robots.txt/ads.txt/llms.txt.

import { tryStep } from '../escalation.js';
import { firstMatch, selectorCandidates } from './shared.js';

/**
 * @param {import('playwright').Page} page
 * @param {{ pageName: string, title?: string, description?: string }} input
 */
export async function setPageSeo(page, { pageName, title, description }, opts = {}) {
	return tryStep(
		{
			flow: 'seoPanel',
			step: `seo-${pageName}`,
			hint: `Open the "${pageName}" page settings > SEO tab and set title="${title ?? ''}" description="${description ?? ''}".`,
			page,
			...opts,
		},
		async () => {
			await page.keyboard.press('/'); // Pages panel
			const item = page
				.locator('[data-hook="page-item"], [role="listitem"]')
				.filter({ hasText: pageName })
				.first();
			await item.waitFor({ state: 'visible', timeout: 10_000 });
			await item.click({ button: 'right' });
			await firstMatch(page, selectorCandidates('page-seo-action', ['[data-hook="seo-action"]', 'text=SEO'], opts), {
				action: 'click',
				timeoutMs: 8_000,
			});
			if (title !== undefined) {
				await firstMatch(
					page,
					selectorCandidates('seo-title-input', ['[data-hook="seo-title-input"] input', 'input[aria-label*="title" i]'], opts),
					{ action: 'fill', value: title, timeoutMs: 8_000 },
				);
			}
			if (description !== undefined) {
				await firstMatch(
					page,
					selectorCandidates('seo-description-input', ['[data-hook="seo-description-input"] textarea', 'textarea[aria-label*="description" i]'], opts),
					{ action: 'fill', value: description, timeoutMs: 8_000 },
				);
			}
			return { ok: true, pageName, title, description };
		},
	);
}
