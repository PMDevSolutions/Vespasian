// Flow: apply the ThemePlan text theme (H1–H6, P1–P3) via Site Styles >
// Typography. Overflow styles beyond the 9 slots are NOT set here — they live
// in global.css (CLI channel) as .vsp-text-* classes.
//
// Font families not in the built-in list require the Upload Fonts dialog
// (TTF/OTF/WOFF/WOFF2, WOFF2 preferred, <4MB) — escalated with the upload plan.

import { tryStep } from '../escalation.js';
import { firstMatch, selectorCandidates } from './shared.js';

const SITE_STYLES_CANDIDATES = [
	'[data-hook="site-styles-button"]',
	'[aria-label="Site Styles"]',
	'[data-hook="left-bar-item-site-styles"]',
];
const TYPOGRAPHY_TAB_CANDIDATES = ['[data-hook="site-styles-typography"]', 'text=Typography'];

const SLOT_LABELS = {
	h1: 'Heading 1',
	h2: 'Heading 2',
	h3: 'Heading 3',
	h4: 'Heading 4',
	h5: 'Heading 5',
	h6: 'Heading 6',
	p1: 'Paragraph 1',
	p2: 'Paragraph 2',
	p3: 'Paragraph 3',
};

/**
 * @param {import('playwright').Page} page
 * @param {{ slots: Record<string, { fontSize: string, fontFamily?: string }>, fonts?: Array<object> }} typographyPlan
 */
export async function applyThemeTypography(page, typographyPlan, opts = {}) {
	const uploads = (typographyPlan.fonts ?? []).filter((f) => f.match?.type === 'upload');
	if (uploads.length > 0) {
		return {
			escalation: true,
			flow: 'themeTypography',
			step: 'font-upload',
			hint:
				'Upload these font families via the editor Upload Fonts dialog before setting the text theme ' +
				'(WOFF2 preferred, <4MB — no font-upload API exists): ' +
				uploads.map((f) => f.family).join(', '),
			detail: uploads,
		};
	}

	const openPanel = await tryStep(
		{ flow: 'themeTypography', step: 'open-typography', hint: 'Open Site Styles > Typography in the Studio left bar.', page, ...opts },
		async () => {
			await firstMatch(page, selectorCandidates('site-styles', SITE_STYLES_CANDIDATES, opts), { action: 'click' });
			await firstMatch(page, selectorCandidates('typography-tab', TYPOGRAPHY_TAB_CANDIDATES, opts), { action: 'click', timeoutMs: 10_000 });
			return { ok: true };
		},
	);
	if (openPanel?.escalation) return openPanel;

	const applied = [];
	for (const [slot, style] of Object.entries(typographyPlan.slots ?? {})) {
		const label = SLOT_LABELS[slot] ?? slot;
		const result = await tryStep(
			{
				flow: 'themeTypography',
				step: `set-${slot}`,
				hint: `In Site Styles > Typography set "${label}" to ${style.fontSize}${style.fontFamily ? ` / ${style.fontFamily}` : ''}.`,
				page,
				...opts,
			},
			async () => {
				const row = page
					.locator('[data-hook="text-style-item"], [role="listitem"]')
					.filter({ hasText: label })
					.first();
				await row.waitFor({ state: 'visible', timeout: 8_000 });
				await row.click();
				const sizeInput = await firstMatch(
					page,
					selectorCandidates('font-size-input', ['[data-hook="font-size-input"] input', 'input[aria-label="Font size"]'], opts),
					{ timeoutMs: 8_000 },
				);
				await sizeInput.locator.fill(String(Number.parseFloat(style.fontSize) || style.fontSize));
				await page.keyboard.press('Enter');
				return { slot, label, ...style };
			},
		);
		applied.push(result);
		if (result?.escalation) {
			return {
				escalation: true,
				flow: 'themeTypography',
				step: result.step,
				screenshotPath: result.screenshotPath,
				hint:
					'Apply the remaining text-theme slots in Site Styles > Typography: ' +
					Object.entries(typographyPlan.slots ?? {})
						.map(([s, v]) => `${SLOT_LABELS[s] ?? s}=${v.fontSize}`)
						.join(', '),
				detail: result.detail,
			};
		}
	}
	return { ok: true, applied };
}
