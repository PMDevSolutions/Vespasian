// Helpers for the Canva-to-Wix integration test.
//
// Two execution surfaces:
//   - Host shell (bash) for the deterministic canva-wix helper scripts.
//   - The @vespasian/wix-driver JS API (imported by relative path) for
//     BuildPlan compile + dry-run apply — recording transports only, so the
//     suite needs zero Wix credentials and makes zero network calls.
//
// The vespasian CLI surface (bin/vespasian.mjs) is probed with cliSupports();
// callers skip CLI-shaped assertions cleanly while subcommands are missing.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Repo root (two levels up from tests/canva-e2e/). */
export const ROOT = resolve(__dirname, '..', '..');

export const FIXTURE_DIR = resolve(ROOT, 'tests/fixtures/canva/landing');
export const CLI_PATH = resolve(ROOT, 'bin/vespasian.mjs');
export const DRIVER_ENTRY = resolve(ROOT, 'packages/wix-driver/src/index.js');

/** Run a host command, returning trimmed stdout. Throws on non-zero exit. */
export function run(cmd, args, opts = {}) {
	return execFileSync(cmd, args, {
		cwd: ROOT,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		...opts,
	}).trim();
}

/** Run one of the canva-wix helper scripts via bash; returns stdout. */
export function runScript(relPath, args = []) {
	return run('bash', [relPath, ...args]);
}

/** True when packages/wix-driver is present (it is another workspace package). */
export function driverAvailable() {
	return existsSync(DRIVER_ENTRY);
}

/** Import the wix-driver by path (workspace-relative, no root dependency). */
export async function importDriver() {
	return import(new URL(`file://${DRIVER_ENTRY}`).href);
}

/**
 * Does bin/vespasian.mjs advertise a subcommand in its --help output?
 * Never throws — returns false on any error so suites can skip cleanly.
 */
export function cliSupports(subcommand) {
	try {
		const res = spawnSync(process.execPath, [CLI_PATH, '--help'], {
			cwd: ROOT,
			encoding: 'utf8',
			timeout: 30_000,
		});
		const text = `${res.stdout ?? ''}${res.stderr ?? ''}`;
		return new RegExp(`(^|[\\s|])${subcommand}([\\s|]|$)`, 'm').test(text);
	} catch {
		return false;
	}
}

/**
 * Build a minimal content model from the convert-html-to-wix.sh block list:
 * one page whose sections are delimited by the section start/end markers.
 */
export function blocksToContentModel(blockDoc, pageTitle = 'Home') {
	const sections = [];
	let current = null;
	let topLevel = { name: 'main', blocks: [] };

	for (const block of blockDoc.blocks) {
		if (block.type === 'section' && block.boundary === 'start') {
			current = { name: `section-${sections.length + 1}`, blocks: [] };
			continue;
		}
		if (block.type === 'section' && block.boundary === 'end') {
			if (current) sections.push(current);
			current = null;
			continue;
		}
		const target = current ?? topLevel;
		if (block.type === 'heading' || block.type === 'paragraph') {
			target.blocks.push({ type: 'text', text: block.text });
		} else if (block.type === 'image') {
			target.blocks.push({ type: 'image', assetSlug: block.src });
		} else if (block.type === 'button') {
			target.blocks.push({ type: 'button', text: block.text, href: block.href });
		} else if (block.type === 'list') {
			target.blocks.push({ type: 'text', text: (block.items ?? []).join('\n') });
		}
	}
	if (topLevel.blocks.length) sections.unshift(topLevel);

	return { pages: [{ title: pageTitle, sections }], collections: [] };
}
