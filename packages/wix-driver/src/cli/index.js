// CLI channel — Git integration + `wix` CLI wrapper.
//
// The only fully headless styling channel on Wix: writes src/styles/global.css
// and Velo files into a local site-repo working dir, then pushes/publishes via
// git + the wix CLI when those binaries exist. When they don't, files are
// staged locally and human-runnable instructions are returned instead of
// failing — dry-run and credential-less CI complete either way.
//
// Sequencing rule enforced here: page code files cannot be created from the
// IDE (pages must exist in the editor first), so push()/publish() refuse to
// run until the executor flips the pages-ready flag after the editor phase.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { isDryRunEnv } from '../rest/index.js';

export const GLOBAL_CSS_PATH = join('src', 'styles', 'global.css');

/** Is a binary available on PATH? (probed with `command -v`) */
export function hasBinary(name) {
	try {
		execFileSync('sh', ['-c', `command -v ${name}`], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

/**
 * @param {Object} [options]
 * @param {string} [options.repoDir]   The site's Git-integration working copy.
 * @param {string} [options.stageDir]  Fallback staging dir (default .vespasian/dryrun/site-repo).
 * @param {boolean} [options.dryRun]   Never shell out; always stage (default VESPASIAN_DRY_RUN=1|true).
 * @param {(cmd: string[], cwd: string) => void} [options.exec]  Injectable for tests.
 */
export function createCliChannel(options = {}) {
	const {
		repoDir,
		stageDir = join('.vespasian', 'dryrun', 'site-repo'),
		dryRun = isDryRunEnv(),
		exec = (cmd, cwd) => execFileSync(cmd[0], cmd.slice(1), { cwd, stdio: 'inherit' }),
	} = options;

	const workDir = repoDir ?? stageDir;
	let pagesReady = false;
	const written = [];

	function writeInto(relativePath, content) {
		const target = resolve(workDir, relativePath);
		const root = resolve(workDir);
		// path.relative-based containment check: a prefix match alone would let
		// sibling dirs like <root>-evil slip through.
		const rel = relative(root, target);
		if (rel.startsWith('..') || isAbsolute(rel)) {
			throw new Error(`Refusing to write outside the site repo: ${relativePath}`);
		}
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, content);
		written.push(relativePath);
		return target;
	}

	return {
		workDir,
		get written() {
			return [...written];
		},

		/**
		 * Executor flips this once the editor phase actually completed with no
		 * pending-agent page work (dry-run counts pending steps as done for
		 * sequencing; a live run keeps the guard closed until the agent runs).
		 */
		setPagesReady(value) {
			pagesReady = Boolean(value);
		},
		get pagesReady() {
			return pagesReady;
		},

		/** Write the generated global.css (Studio custom CSS). */
		writeGlobalCss({ css }) {
			const path = writeInto(GLOBAL_CSS_PATH, css);
			return { ok: true, path, staged: !repoDir || dryRun };
		},

		/** Write a Velo file (page/backend/public code) under src/. */
		writeVeloFile({ path, content }) {
			if (!path?.startsWith('src/')) {
				throw new Error(`Velo files must live under src/ (got ${path})`);
			}
			const target = writeInto(path, content);
			return { ok: true, path: target, staged: !repoDir || dryRun };
		},

		/**
		 * Commit + push the working copy (Git integration auto-syncs the site).
		 * Requires pagesReady — page code files must never precede the pages.
		 */
		push({ message = 'chore: vespasian generated site code' } = {}) {
			if (!pagesReady) {
				throw new Error(
					'CLI push refused: pages do not exist in the editor yet. ' +
						'The code phase runs only after the editor phase (pages before code push).',
				);
			}
			if (dryRun || !repoDir || !hasBinary('git')) {
				return {
					ok: true,
					staged: true,
					instructions: [
						`cd ${workDir}`,
						'git add -A',
						`git commit -m ${JSON.stringify(message)}`,
						'git push',
					],
				};
			}
			exec(['git', 'add', '-A'], repoDir);
			exec(['git', 'commit', '-m', message], repoDir);
			exec(['git', 'push'], repoDir);
			return { ok: true, staged: false };
		},

		/**
		 * Publish including repo code (`wix publish`). Use instead of the REST
		 * publish when the change set includes code; falls back to instructions
		 * when the wix CLI is not installed.
		 */
		publish() {
			if (!pagesReady) {
				throw new Error('CLI publish refused: run the editor phase first (pages before code push).');
			}
			if (dryRun || !repoDir || !hasBinary('wix')) {
				return {
					ok: true,
					staged: true,
					instructions: [`cd ${workDir}`, 'wix publish'],
				};
			}
			exec(['wix', 'publish'], repoDir);
			return { ok: true, staged: false };
		},
	};
}
