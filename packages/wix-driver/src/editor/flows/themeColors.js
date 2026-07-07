// Flow: apply the ThemePlan color roles + site colors via Site Styles > Colors.
//
// There is NO theme write API — this panel is the single biggest forced-
// Playwright surface. Every shade is typed as an exact hex value (Wix
// auto-generates shade gradients that drift from extracted values otherwise).
// Verification happens later in qa/assertTheme.js by reading --wst-* vars on
// the published page.

import { tryStep } from '../escalation.js';
import { firstMatch, selectorCandidates } from './shared.js';

const SITE_STYLES_CANDIDATES = [
	'[data-hook="site-styles-button"]',
	'[aria-label="Site Styles"]',
	'[data-hook="left-bar-item-site-styles"]',
];
const COLORS_TAB_CANDIDATES = ['[data-hook="site-styles-colors"]', 'text=Colors'];

/**
 * @param {import('playwright').Page} page
 * @param {{ roles: Record<string,{ value: string }>, siteColors: Array<{ name: string, value: string }> }} colorsPlan
 */
export async function applyThemeColors(page, colorsPlan, opts = {}) {
	const openPanel = await tryStep(
		{ flow: 'themeColors', step: 'open-site-styles', hint: 'Open Site Styles > Colors in the Studio left bar.', page, ...opts },
		async () => {
			await firstMatch(page, selectorCandidates('site-styles', SITE_STYLES_CANDIDATES, opts), { action: 'click' });
			await firstMatch(page, selectorCandidates('colors-tab', COLORS_TAB_CANDIDATES, opts), { action: 'click', timeoutMs: 10_000 });
			return { ok: true };
		},
	);
	if (openPanel?.escalation) return openPanel;

	const applied = [];
	const entries = [
		...Object.entries(colorsPlan.roles ?? {}).map(([role, color]) => ({ label: role, value: color.value })),
		...(colorsPlan.siteColors ?? []).map((c) => ({ label: c.name, value: c.value })),
	];

	for (const entry of entries) {
		const result = await tryStep(
			{
				flow: 'themeColors',
				step: `set-${entry.label}`,
				hint: `In Site Styles > Colors set "${entry.label}" to ${entry.value} (type the exact hex into the picker).`,
				page,
				...opts,
			},
			async () => {
				const swatch = page
					.locator('[data-hook="color-picker-item"], [data-hook="site-color-item"], [role="button"]')
					.filter({ hasText: entry.label })
					.first();
				await swatch.waitFor({ state: 'visible', timeout: 8_000 });
				await swatch.click();
				const hexInput = await firstMatch(
					page,
					selectorCandidates('hex-input', ['[data-hook="hex-input"] input', 'input[aria-label="Hex"]', 'input[value^="#"]'], opts),
					{ timeoutMs: 8_000 },
				);
				await hexInput.locator.fill(entry.value);
				await page.keyboard.press('Enter');
				return { label: entry.label, value: entry.value };
			},
		);
		applied.push(result);
		if (result?.escalation) {
			// One escalation means the panel diverged — hand the remainder to the agent in one go.
			return {
				escalation: true,
				flow: 'themeColors',
				step: result.step,
				screenshotPath: result.screenshotPath,
				hint:
					`Apply the remaining theme colors in Site Styles > Colors (exact hex values): ` +
					entries.map((e) => `${e.label}=${e.value}`).join(', '),
				detail: result.detail,
			};
		}
	}
	return { ok: true, applied };
}
