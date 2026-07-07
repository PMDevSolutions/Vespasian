// QA capture — screenshots of the PUBLISHED site (public, no auth, no
// anti-bot friction) at the three Wix Studio breakpoints.
//
// playwright is imported lazily so this module stays import-safe in
// browserless environments (unit tests, dry-run CI).

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Studio breakpoints: desktop 1001+, tablet 751–1000, mobile 320–750. */
export const DEFAULT_WIDTHS = [1280, 900, 375];

/**
 * @param {string} url  Published site URL (from listPublishedSiteUrls).
 * @param {Object} [options]
 * @param {number[]} [options.widths]
 * @param {number} [options.height]
 * @param {string} [options.outDir]
 * @param {boolean} [options.fullPage]
 * @returns {Promise<Array<{ width: number, path: string }>>}
 */
export async function captureScreenshots(url, options = {}) {
	const {
		widths = DEFAULT_WIDTHS,
		height = 900,
		outDir = join('.vespasian', 'qa', 'screenshots'),
		fullPage = true,
	} = options;

	const { chromium } = await import('playwright');
	mkdirSync(outDir, { recursive: true });

	const browser = await chromium.launch({ headless: true });
	const shots = [];
	try {
		for (const width of widths) {
			const page = await browser.newPage({ viewport: { width, height } });
			await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
			const path = join(outDir, `published-${width}.png`);
			await page.screenshot({ path, fullPage });
			shots.push({ width, path });
			await page.close();
		}
	} finally {
		await browser.close();
	}
	return shots;
}
