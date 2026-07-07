// Flow: select an already-uploaded asset in the Media Manager picker.
//
// Media-first architecture: bytes always go up via the REST media API first;
// the editor only ever PICKS the staged asset. The Media Manager lives in an
// iframe (#mediaGalleryFrame) with data-hooks verified mid-2026:
// add-media-button, gallery-file, select-items.

import { tryStep } from '../escalation.js';
import { selectorCandidates } from './shared.js';

/**
 * @param {import('playwright').Page} page
 * @param {{ fileName: string }} input  The staged asset's file name (already uploaded via API).
 */
export async function pickMedia(page, { fileName }, opts = {}) {
	return tryStep(
		{
			flow: 'mediaPicker',
			step: `pick-${fileName}`,
			hint: `In the open Media Manager, select the pre-uploaded file "${fileName}" and confirm (Add to Page). The asset is already in the Media Manager — never re-upload through the UI.`,
			page,
			...opts,
		},
		async () => {
			const frame = page.frameLocator('#mediaGalleryFrame');
			const candidates = selectorCandidates('gallery-file', ['[data-hook="gallery-file"]'], opts);
			let file;
			for (const selector of candidates) {
				const locator = frame.locator(selector).filter({ hasText: fileName }).first();
				if (await locator.isVisible({ timeout: 10_000 }).catch(() => false)) {
					file = locator;
					break;
				}
			}
			if (!file) throw new Error(`File "${fileName}" not found in the Media Manager gallery`);
			await file.click();
			const confirm = frame.locator('[data-hook="select-items"], button:has-text("Add to Page")').first();
			await confirm.click({ timeout: 10_000 });
			return { ok: true, fileName };
		},
	);
}
