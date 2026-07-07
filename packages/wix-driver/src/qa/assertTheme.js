// Theme assertion — the objective acceptance gate for the Playwright theming
// steps: read computed --wst-* / --vsp-* custom properties off the published
// page and compare against the ThemePlan.

import { normalizeHex } from '../translate/palette.js';

/**
 * Read computed CSS custom properties from a live page.
 * @param {import('playwright').Page} page
 * @param {string[]} varNames  e.g. ['--wst-color-fill-base-1', '--vsp-space-40']
 * @returns {Promise<Record<string, string>>}
 */
export async function readCssVars(page, varNames) {
	return page.evaluate((names) => {
		const style = getComputedStyle(document.documentElement);
		const out = {};
		for (const name of names) out[name] = style.getPropertyValue(name).trim();
		return out;
	}, varNames);
}

/**
 * Compare expected variable values against a published URL.
 * Launches its own browser (lazy playwright import).
 *
 * @param {string} url
 * @param {Record<string, string>} expected  varName → expected value (hex values compared normalized)
 * @returns {Promise<{ ok: boolean, mismatches: Array<{ name: string, expected: string, actual: string }> }>}
 */
export async function assertThemeVars(url, expected) {
	const { chromium } = await import('playwright');
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
		const actual = await readCssVars(page, Object.keys(expected));
		return compareVars(expected, actual);
	} finally {
		await browser.close();
	}
}

/** Pure comparison (unit-testable without a browser). */
export function compareVars(expected, actual) {
	const mismatches = [];
	for (const [name, want] of Object.entries(expected)) {
		const got = actual[name] ?? '';
		const wantNorm = normalizeHex(want) ?? want.trim().toLowerCase();
		const gotNorm = normalizeHex(got) ?? got.trim().toLowerCase();
		if (wantNorm !== gotNorm) {
			mismatches.push({ name, expected: want, actual: got });
		}
	}
	return { ok: mismatches.length === 0, mismatches };
}
