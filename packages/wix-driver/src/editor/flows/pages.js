// Flow: page management (create / rename) via the Pages panel.
//
// Keyboard-first where possible ('/' opens the Pages panel, Alt+N adds a
// blank page in the classic editor); Studio uses the Pages panel button.
// Reordering is drag-and-drop — deliberately escalated to the agent.

import { tryStep } from '../escalation.js';
import { firstMatch, selectorCandidates } from './shared.js';

const PAGES_PANEL_CANDIDATES = [
	'[data-hook="pages-panel-pp"]',
	'[data-hook="document-manager-panel"]',
	'[aria-label="Pages"]',
];

/**
 * Open the Pages panel.
 * @param {import('playwright').Page} page
 */
export async function openPagesPanel(page, opts = {}) {
	return tryStep(
		{ flow: 'pages', step: 'open-panel', hint: 'Open the Pages panel manually (keyboard "/" in classic, left bar in Studio).', page, ...opts },
		async () => {
			await page.keyboard.press('/');
			await firstMatch(page, selectorCandidates('pages-panel', PAGES_PANEL_CANDIDATES, opts), {
				timeoutMs: 10_000,
			});
			return { ok: true };
		},
	);
}

/**
 * Add a blank page (classic: Alt+N; Studio: add-page button).
 * @param {import('playwright').Page} page
 * @param {{ name?: string }} input
 */
export async function addPage(page, { name } = {}, opts = {}) {
	const opened = await openPagesPanel(page, opts);
	if (opened?.escalation) return opened;

	return tryStep(
		{ flow: 'pages', step: 'add-page', hint: `Add a page${name ? ` named "${name}"` : ''} via the Pages panel.`, page, ...opts },
		async () => {
			await page.keyboard.press('Alt+n');
			if (name) {
				const rename = await renamePage(page, { from: null, to: name }, opts);
				if (rename?.escalation) throw new Error(`Page added but rename failed: ${rename.detail ?? ''}`);
			}
			return { ok: true, name };
		},
	);
}

/**
 * Rename a page via the page list item context menu.
 * @param {import('playwright').Page} page
 * @param {{ from: string|null, to: string }} input
 */
export async function renamePage(page, { from, to }, opts = {}) {
	return tryStep(
		{ flow: 'pages', step: 'rename-page', hint: `Rename page ${from ?? '(newest)'} to "${to}" via its context menu.`, page, ...opts },
		async () => {
			const item = from
				? page.locator(`[data-hook="page-item"], [role="listitem"]`).filter({ hasText: from }).first()
				: page.locator(`[data-hook="page-item"], [role="listitem"]`).last();
			await item.waitFor({ state: 'visible', timeout: 10_000 });
			await item.click({ button: 'right' });
			await firstMatch(page, selectorCandidates('page-rename', ['[data-hook="rename-action"]', 'text=Rename'], opts), {
				action: 'click',
				timeoutMs: 8_000,
			});
			const input = page.locator('input:focus');
			await input.fill(to, { timeout: 8_000 });
			await page.keyboard.press('Enter');
			return { ok: true, from, to };
		},
	);
}

/**
 * Reorder pages — drag-and-drop on a perishable panel: always escalate.
 * @param {{ order: string[] }} input
 */
export async function reorderPages(page, { order }) {
	return {
		escalation: true,
		flow: 'pages',
		step: 'reorder',
		hint: `Drag pages into this order in the Pages panel: ${order.join(' → ')}. (No API for menu order; drag-drop is agent work.)`,
	};
}
