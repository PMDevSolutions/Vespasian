// Flow: save. Studio (and Harmony) autosave — save is a designed no-op there.
// Classic editor: Ctrl/Cmd+S, then await the save toast (keyboard-first: no
// selectors needed for the trigger).

import { tryStep } from '../escalation.js';

/**
 * @param {import('playwright').Page} page
 * @param {{ editorType?: string }} [input]
 */
export async function save(page, { editorType = 'WIX_STUDIO' } = {}, opts = {}) {
	if (editorType !== 'WIX_EDITOR') {
		return { ok: true, noop: true, reason: `${editorType} autosaves` };
	}

	return tryStep(
		{ flow: 'save', step: 'ctrl-s', hint: 'Press Ctrl/Cmd+S in the editor and confirm the save toast (handle the first-save free-domain dialog on brand-new sites).', page, ...opts },
		async () => {
			const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
			await page.keyboard.press(`${modifier}+s`);
			// First save on a new site opens a "choose your domain" dialog — accept defaults.
			const dialog = page.locator('[data-hook="save-your-site-panel"], [data-hook="baseModalLayout"]').first();
			if (await dialog.isVisible({ timeout: 5_000 }).catch(() => false)) {
				const done = dialog.locator('[data-hook="done-button"], button:has-text("Save")').first();
				await done.click({ timeout: 8_000 });
			}
			return { ok: true, noop: false };
		},
	);
}
