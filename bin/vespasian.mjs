#!/usr/bin/env node
// Vespasian CLI — design in (Figma · Canva · InDesign), live Wix site out.
//
//   vespasian init                        project setup wizard
//   vespasian login --editor              one-time consent + headed Wix login
//   vespasian site create|use|list        provision / select the target Wix site
//   vespasian pipeline indesign <input>   .idml/.pdf/IR → artifacts + BuildPlan
//   vespasian plan <ir-or-artifact-dir>   compile a BuildPlan (offline, pure)
//   vespasian apply <plan>                execute a BuildPlan against Wix
//   vespasian publish                     publish the current editor state
//   vespasian qa [url]                    screenshots + theme-var assertions
//
// Channel strategy (docs/wix/ARCHITECTURE.md): official REST APIs first, the
// Wix CLI / Git integration for code, and consent-gated Playwright editor
// automation only where no API exists. VESPASIAN_DRY_RUN=1 turns both planes
// into recording transports — zero credentials, zero network.
//
// Figma and Canva conversions remain Claude-Code-driven flows; only the
// InDesign pipeline runs fully from this CLI.

import { promises as fs } from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
// Dynamic import() needs a file:// URL string (Windows absolute paths aren't valid specifiers).
const PIPELINE = pathToFileURL(path.join(ROOT, 'packages/pipeline/src/indesign/index.js')).href;
const DRIVER = pathToFileURL(path.join(ROOT, 'packages/wix-driver/src/index.js')).href;

const PHASES = ['provision', 'media', 'data', 'editor', 'code', 'properties', 'publish', 'qa'];

const argv = process.argv.slice(2);

async function main() {
	loadDotEnv();

	const [group, ...rest] = argv;

	if (!group || group === '-h' || group === '--help' || group === 'help') {
		printRootUsage();
		process.exit(group ? 0 : 2);
	}

	switch (group) {
		case 'init': return runInit(rest);
		case 'login': return runLogin(rest);
		case 'site': return runSite(rest);
		case 'pipeline': return runPipelineGroup(rest);
		case 'plan': return runPlan(rest);
		case 'apply': return runApply(rest);
		case 'publish': return runPublish(rest);
		case 'qa': return runQa(rest);
		default:
			fail(`Unknown command: ${group}`);
			printRootUsage();
			process.exit(2);
	}
}

// ---------------------------------------------------------------------------
// Shared plumbing
// ---------------------------------------------------------------------------

function fail(msg) {
	process.stderr.write(`error: ${msg}\n`);
}

function info(msg) {
	process.stderr.write(`${msg}\n`);
}

/**
 * Load ./.env into process.env (never overriding variables already set).
 * The architecture doc's env vars (WIX_API_KEY, …) all live in .env, which is
 * gitignored; this is the single place they get loaded for CLI runs.
 */
function loadDotEnv(file = path.resolve('.env')) {
	if (!existsSync(file)) return;
	for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
		const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
		if (!m || line.trim().startsWith('#')) continue;
		let value = m[2];
		if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
		if (process.env[m[1]] === undefined) process.env[m[1]] = value;
	}
}

/**
 * Tiny flag parser shared by every subcommand.
 * spec: { key: { flags: ['--x', '-x'], value?: true, number?: true } }
 * Prints `usage()` and exits on -h/--help; exits 2 on malformed input.
 */
function parseFlags(args, spec, usage, { maxPositionals = 1 } = {}) {
	const opts = {};
	const positionals = [];

	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		if (arg === '-h' || arg === '--help') {
			usage();
			process.exit(0);
		}
		const entry = Object.entries(spec).find(([, def]) => def.flags.includes(arg));
		if (entry) {
			const [key, def] = entry;
			if (def.value) {
				const next = args[i + 1];
				if (next === undefined || (next.startsWith('-') && next !== '-')) {
					fail(`${arg} requires a value`);
					usage();
					process.exit(2);
				}
				i += 1;
				opts[key] = def.number ? Number(next) : next;
				if (def.number && !Number.isFinite(opts[key])) {
					fail(`${arg} expects a number (got ${next})`);
					process.exit(2);
				}
			} else {
				opts[key] = true;
			}
			continue;
		}
		if (arg === '-' || !arg.startsWith('-')) {
			if (positionals.length < maxPositionals) {
				positionals.push(arg);
				continue;
			}
		}
		fail(`Unknown argument: ${arg}`);
		usage();
		process.exit(2);
	}

	return { opts, positionals };
}

async function loadConfig(explicit) {
	const file = explicit ?? path.resolve('vespasian.config.json');
	try {
		return JSON.parse(await fs.readFile(file, 'utf8'));
	} catch (err) {
		if (explicit) throw new Error(`could not read config ${file}: ${err.message}`);
		return null; // no default config present — fine
	}
}

async function readStdinBytes() {
	const chunks = [];
	for await (const chunk of process.stdin) chunks.push(chunk);
	return Buffer.concat(chunks);
}

async function writeJson(file, value) {
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function slugify(value) {
	return String(value ?? '')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** Update (or append) KEY=value lines in .env, preserving everything else. */
async function updateEnvFile(overrides, file = path.resolve('.env')) {
	let lines = [];
	try {
		lines = (await fs.readFile(file, 'utf8')).split(/\r?\n/);
		if (lines.at(-1) === '') lines.pop();
	} catch {
		/* no .env yet — create one */
	}
	const seen = new Set();
	const out = lines.map((line) => {
		const m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
		if (!m || overrides[m[1]] === undefined) return line;
		seen.add(m[1]);
		return `${m[1]}=${overrides[m[1]]}`;
	});
	for (const [key, value] of Object.entries(overrides)) {
		if (!seen.has(key)) out.push(`${key}=${value}`);
	}
	await fs.writeFile(file, `${out.join('\n')}\n`);
	return file;
}

function askLine(question) {
	const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
	return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

// ---------------------------------------------------------------------------
// Artifact adapters — pipeline artifacts → wix-driver compilePlan inputs
// ---------------------------------------------------------------------------

const MIME_BY_EXT = {
	jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
	webp: 'image/webp', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff',
};

/**
 * Adapt an assets.manifest.json into the driver's assets input. The pipeline
 * manifest lists { frameId, href, relPath, resolved }; the plan schema wants
 * { slug, path, mimeType, fileName }. Only RESOLVED assets become upload
 * steps — unresolved ones are reported, never uploaded as empty files.
 * Manifests already in driver shape (entries with `slug`) pass through.
 */
function adaptAssetsManifest(manifest, planDirRel) {
	const entries = manifest?.assets ?? [];
	const assets = [];
	const slugByFrame = new Map();
	let unresolved = 0;

	for (const entry of entries) {
		if (entry.slug) {
			assets.push(entry); // already driver-shaped
			continue;
		}
		if (entry.resolved === false) {
			unresolved += 1;
			continue;
		}
		const fileName = path.posix.basename(entry.relPath ?? '');
		if (!fileName) continue;
		const slug = fileName.replace(/\.[^.]+$/, '');
		const ext = (fileName.split('.').pop() ?? '').toLowerCase();
		assets.push({
			slug,
			path: path.posix.join(planDirRel.split(path.sep).join('/'), entry.relPath),
			fileName,
			mimeType: MIME_BY_EXT[ext] ?? 'image/png',
		});
		if (entry.frameId) slugByFrame.set(entry.frameId, slug);
	}

	return { assets: { assets }, slugByFrame, unresolved };
}

/**
 * Adapt the pipeline's semantic content model (contentVersion/sections of
 * heading|paragraph|figure blocks) into the driver's pages/sections/blocks
 * shape. Content already in driver shape (top-level `pages`) passes through.
 */
function adaptContent(content, { siteTitle, slugByFrame = new Map() } = {}) {
	if (!content) return { pages: [] };
	if (Array.isArray(content.pages)) return content;

	const sections = (Array.isArray(content.sections) ? content.sections : []).map((section, i) => ({
		id: section.id ?? `s${i + 1}`,
		name: section.title ?? section.id ?? `section-${i + 1}`,
		blocks: (section.blocks ?? []).map((block) => adaptBlock(block, slugByFrame)),
	}));

	return { pages: [{ title: siteTitle ?? 'Vespasian Site', sections }] };
}

function adaptBlock(block, slugByFrame) {
	if (block.type === 'figure') {
		const slug = block.frameRef ? slugByFrame.get(block.frameRef) : undefined;
		return {
			type: 'image',
			...(slug ? { assetSlug: slug } : {}),
			...(block.bounds ? { bounds: block.bounds } : {}),
		};
	}
	if (block.type === 'heading') {
		const level = Math.min(6, Math.max(1, Number(block.level) || 2));
		return { type: 'text', text: block.text ?? '', style: { themeSlot: `h${level}` } };
	}
	return { type: 'text', text: block.text ?? '' };
}

/** Steps per channel, for summaries and the plan report. */
function countByMethod(plan) {
	const counts = { api: 0, cli: 0, playwright: 0, agent: 0 };
	for (const step of plan.steps) counts[step.method] = (counts[step.method] ?? 0) + 1;
	return counts;
}

function buildPlanReport(plan, { tokens, manifest, unresolved = 0, artifacts = [] } = {}) {
	const byMethod = countByMethod(plan);
	const lines = [
		`# Vespasian Build Plan — ${plan.site.title}`,
		'',
		`Source hash: \`${plan.meta.sourceHash}\``,
		'',
		'## Artifacts',
		'',
		...artifacts.map((a) => `- \`${a}\``),
		'',
		'## Steps',
		'',
		'| Phase | Steps |',
		'|---|---|',
	];
	for (const phase of PHASES) {
		const n = plan.steps.filter((s) => s.phase === phase).length;
		if (n > 0) lines.push(`| ${phase} | ${n} |`);
	}
	lines.push(
		'',
		`Channels: ${byMethod.api} api · ${byMethod.cli} cli · ${byMethod.playwright} playwright · ${byMethod.agent} agent.`,
		'',
		'Playwright and agent steps need the consent-gated editor plane; without it,',
		'`vespasian apply` records them as pending-agent work for the **wix-site-builder** agent.',
		'',
	);

	if (tokens) {
		lines.push(
			'## Design tokens',
			'',
			`palette ${tokens.palette?.length ?? 0} · fontSizes ${tokens.fontSizes?.length ?? 0} · ` +
				`fontFamilies ${tokens.fontFamilies?.length ?? 0} · spacingSizes ${tokens.spacingSizes?.length ?? 0}` +
				(tokens.report?.warnings?.length ? ` · mapper warnings ${tokens.report.warnings.length}` : ''),
			'',
		);
	}

	if (manifest) {
		const total = manifest.assets?.length ?? 0;
		lines.push('## Assets', '', `${total - unresolved} staged, ${unresolved} unresolved (unresolved assets are reported, not uploaded).`, '');
	}

	if (plan.fidelity.length > 0) {
		lines.push('## Fidelity notes (translation losses)', '', '| Severity | Code | Detail |', '|---|---|---|');
		for (const note of plan.fidelity) {
			lines.push(`| ${note.severity} | \`${note.code}\` | ${String(note.message).replaceAll('|', '\\|')} |`);
		}
		lines.push('');
	} else {
		lines.push('## Fidelity notes', '', 'No translation losses recorded.', '');
	}

	lines.push('## Next', '', '```', 'vespasian apply <plan.json> --dry-run   # rehearse (no credentials)', 'vespasian apply <plan.json>             # live run', '```', '');
	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// vespasian init — delegate to the setup wizard
// ---------------------------------------------------------------------------

function runInit(args) {
	const child = spawn(process.execPath, [path.join(ROOT, 'scripts/init.mjs'), ...args], { stdio: 'inherit' });
	child.on('exit', (code) => process.exit(code ?? 1));
}

// ---------------------------------------------------------------------------
// vespasian pipeline indesign
// ---------------------------------------------------------------------------

async function runPipelineGroup(args) {
	const [name, ...rest] = args;
	if (!name || name === '-h' || name === '--help') {
		printPipelineUsage();
		process.exit(name ? 0 : 2);
	}
	if (name === 'figma' || name === 'canva') {
		fail(`the ${name} pipeline is a Claude-Code-driven flow — see docs/${name}-to-wix/README.md`);
		process.exit(2);
	}
	if (name !== 'indesign') {
		fail(`Unknown pipeline: ${name}`);
		printPipelineUsage();
		process.exit(2);
	}
	await runIndesign(rest);
}

async function runIndesign(args) {
	const { opts, positionals } = parseFlags(args, {
		plan: { flags: ['--plan'], value: true },
		output: { flags: ['--output', '-o'], value: true },
		config: { flags: ['--config'], value: true },
		slug: { flags: ['--slug'], value: true },
		name: { flags: ['--name'], value: true },
		namespace: { flags: ['--namespace'], value: true },
		templateId: { flags: ['--template-id'], value: true },
		dpi: { flags: ['--dpi'], value: true, number: true },
		assetDir: { flags: ['--asset-dir'], value: true },
		fluid: { flags: ['--fluid'] },
		quiet: { flags: ['--quiet', '-q'] },
	}, printIndesignUsage);

	const input = positionals[0];
	if (!input) {
		fail('an input is required (an .idml/.pdf file, an IR JSON, or - for stdin)');
		printIndesignUsage();
		process.exit(2);
	}

	// Lazy imports so `--help` never pays for loading the pipeline or driver.
	const pipeline = await import(PIPELINE);
	const driver = await import(DRIVER);

	const config = await loadConfig(opts.config);
	const cfg = config?.pipeline?.indesign ?? {};

	const bytes = input === '-' ? await readStdinBytes() : await fs.readFile(input);
	const format = pipeline.detectFormat(bytes);

	const parseOpts = {};
	if (opts.dpi !== undefined) parseOpts.dpi = opts.dpi;
	if (opts.name !== undefined) parseOpts.name = opts.name;

	let ir;
	let content;
	if (format === 'unknown') {
		// Not IDML/PDF bytes — expect an IR JSON or an ingest artifact { ir, content }.
		let parsed;
		try {
			parsed = JSON.parse(bytes.toString('utf8'));
		} catch {
			throw new Error('input is neither an .idml, a .pdf, nor parseable JSON (IR / ingest artifact)');
		}
		ir = pipeline.ir.Document.parse(parsed?.ir ?? parsed);
		content = parsed?.content ?? pipeline.extractContent(ir);
	} else {
		const ingested = await pipeline.ingestBuffer(bytes, parseOpts);
		ir = ingested.ir;
		content = ingested.content;
	}

	const siteTitle = opts.name ?? ir.meta?.name ?? 'Vespasian Site';
	const slug = opts.slug ?? (slugify(siteTitle) || 'indesign-import');
	const planDir = path.resolve(opts.output ?? cfg.output ?? '.vespasian/plans', slug);
	const planDirRel = path.relative(process.cwd(), planDir) || '.';

	// ---- Stage assets (ir.json + assets/ + assets.manifest.json) ----
	let manifest;
	if (format === 'pdf') {
		// PDFs need the decode-to-cache round trip that runAssetStage owns.
		let srcPath = input;
		let tmpDir = null;
		if (input === '-') {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vespasian-cli-'));
			srcPath = path.join(tmpDir, 'input.pdf');
			await fs.writeFile(srcPath, bytes);
		}
		try {
			const staged = await pipeline.runAssetStage({ input: srcPath, outDir: planDir, ...parseOpts });
			manifest = JSON.parse(await fs.readFile(staged.manifestPath, 'utf8'));
		} finally {
			if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
		}
	} else {
		const resolver = format === 'idml' ? pipeline.extractIdmlAssets(bytes) : new Map();
		if (opts.assetDir) await mergeAssetDir(resolver, ir, opts.assetDir, pipeline.planAssets);
		const bundle = pipeline.buildAssetBundle({ ir, resolver, format: format === 'idml' ? 'idml' : 'ir' });
		await pipeline.writeAssetBundle(bundle, planDir);
		manifest = bundle.manifest;
	}

	// ---- Map tokens ----
	const tokenOpts = {};
	const namespace = opts.namespace ?? cfg.namespace;
	if (namespace) tokenOpts.namespace = namespace;
	if (opts.fluid) tokenOpts.fluid = true;
	const tokens = pipeline.mapTokens(ir, tokenOpts);

	// ---- Write the artifact set ----
	await writeJson(path.join(planDir, 'ir.json'), ir);
	await writeJson(path.join(planDir, 'content.json'), content);
	await writeJson(path.join(planDir, 'tokens.json'), tokens);

	// ---- Compile the BuildPlan ----
	const adapted = adaptAssetsManifest(manifest, planDirRel);
	const planContent = adaptContent(content, { siteTitle, slugByFrame: adapted.slugByFrame });
	const plan = driver.compilePlan(
		{ ir, content: planContent, tokens, assets: adapted.assets },
		{ siteTitle, ...(opts.templateId ? { templateId: opts.templateId } : {}) },
	);

	const planPath = opts.plan ? path.resolve(opts.plan) : path.join(planDir, 'plan.json');
	await writeJson(planPath, plan);

	const artifacts = ['ir.json', 'content.json', 'tokens.json', 'assets.manifest.json', path.basename(planPath), 'plan-report.md'];
	await fs.writeFile(
		path.join(planDir, 'plan-report.md'),
		buildPlanReport(plan, { tokens, manifest, unresolved: adapted.unresolved, artifacts }),
	);

	if (!opts.quiet) {
		const byMethod = countByMethod(plan);
		info([
			`plan: ${plan.site.title} (${slug}) → ${planDirRel}`,
			`steps: ${plan.steps.length} total — ${byMethod.api} api · ${byMethod.cli} cli · ${byMethod.playwright} playwright · ${byMethod.agent} agent`,
			`assets: ${adapted.assets.assets.length} staged${adapted.unresolved ? ` (${adapted.unresolved} unresolved)` : ''}  fidelity notes: ${plan.fidelity.length}`,
			`artifacts: ${artifacts.join(', ')}`,
			`next: vespasian apply ${path.relative(process.cwd(), planPath)} --dry-run`,
		].join('\n'));
	}
	process.exit(0);
}

/** Fallback resolver: pull bytes for unresolved hrefs from --asset-dir. */
async function mergeAssetDir(resolver, ir, assetDir, planAssetsFn) {
	const { assets } = planAssetsFn(ir);
	for (const asset of assets) {
		if (!asset.href || resolver.has(asset.href)) continue;
		const base = path.basename(asset.href.replace(/^file:/, '').replace(/[?#].*$/, ''));
		for (const candidate of [base, asset.name]) {
			try {
				const bytes = await fs.readFile(path.join(assetDir, candidate));
				const ext = (candidate.split('.').pop() ?? 'png').toLowerCase();
				resolver.set(asset.href, { bytes, ext });
				break;
			} catch {
				/* try next candidate */
			}
		}
	}
}

// ---------------------------------------------------------------------------
// vespasian plan
// ---------------------------------------------------------------------------

async function runPlan(args) {
	const { opts, positionals } = parseFlags(args, {
		out: { flags: ['--out'], value: true },
		siteTitle: { flags: ['--site-title'], value: true },
		templateId: { flags: ['--template-id'], value: true },
		quiet: { flags: ['--quiet', '-q'] },
	}, printPlanUsage);

	const input = positionals[0];
	if (!input) {
		fail('an input is required (an artifact directory from `vespasian pipeline`, or an IR JSON)');
		printPlanUsage();
		process.exit(2);
	}

	const driver = await import(DRIVER);

	const stat = input === '-' ? null : await fs.stat(input).catch(() => null);
	if (input !== '-' && !stat) {
		fail(`no such file or directory: ${input}`);
		process.exit(2);
	}

	let ir = null;
	let content = null;
	let tokens = null;
	let manifest = null;
	let planDirRel = '.';
	let defaultOut = null;

	if (stat?.isDirectory()) {
		const dir = path.resolve(input);
		planDirRel = path.relative(process.cwd(), dir) || '.';
		const read = async (name) => {
			try {
				return JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
			} catch {
				return null;
			}
		};
		ir = await read('ir.json');
		content = await read('content.json');
		tokens = await read('tokens.json');
		manifest = await read('assets.manifest.json');
		if (!ir && !tokens) {
			fail(`${input} has neither ir.json nor tokens.json — run \`vespasian pipeline indesign\` first`);
			process.exit(2);
		}
		defaultOut = path.join(dir, 'plan.json');
	} else {
		const text = input === '-' ? (await readStdinBytes()).toString('utf8') : await fs.readFile(input, 'utf8');
		const parsed = JSON.parse(text);
		const pipeline = await import(PIPELINE);
		ir = pipeline.ir.Document.parse(parsed?.ir ?? parsed);
		content = parsed?.content ?? pipeline.extractContent(ir);
	}

	if (!tokens) {
		const pipeline = await import(PIPELINE);
		tokens = pipeline.mapTokens(ir);
	}

	const siteTitle = opts.siteTitle ?? ir?.meta?.name ?? undefined;
	const adapted = adaptAssetsManifest(manifest ?? {}, planDirRel);
	const planContent = adaptContent(content, {
		siteTitle: siteTitle ?? 'Vespasian Site',
		slugByFrame: adapted.slugByFrame,
	});

	const plan = driver.compilePlan(
		{ ir: ir ?? {}, content: planContent, tokens, assets: adapted.assets },
		{ ...(siteTitle ? { siteTitle } : {}), ...(opts.templateId ? { templateId: opts.templateId } : {}) },
	);

	const outPath = opts.out ? path.resolve(opts.out) : defaultOut;
	if (outPath) {
		await writeJson(outPath, plan);
		if (!opts.quiet) info(`plan: ${plan.site.title} — ${plan.steps.length} steps → ${path.relative(process.cwd(), outPath)}`);
	} else {
		process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
		if (!opts.quiet) info(`plan: ${plan.site.title} — ${plan.steps.length} steps`);
	}
	process.exit(0);
}

// ---------------------------------------------------------------------------
// vespasian apply
// ---------------------------------------------------------------------------

async function runApply(args) {
	const { opts, positionals } = parseFlags(args, {
		dryRun: { flags: ['--dry-run'] },
		resumeFrom: { flags: ['--resume-from'], value: true },
		repoDir: { flags: ['--repo-dir'], value: true },
		checkpointDir: { flags: ['--checkpoint-dir'], value: true },
		report: { flags: ['--report'], value: true },
		quiet: { flags: ['--quiet', '-q'] },
	}, printApplyUsage);

	const planPath = positionals[0];
	if (!planPath) {
		fail('a plan.json is required (from `vespasian pipeline indesign` or `vespasian plan`)');
		printApplyUsage();
		process.exit(2);
	}

	const driver = await import(DRIVER);
	const plan = JSON.parse(await fs.readFile(planPath, 'utf8'));
	const dryRun = Boolean(opts.dryRun) || driver.isDryRunEnv();

	if (!dryRun) {
		const creds = driver.resolveApiCredentials();
		if (!creds.apiKey) {
			fail('WIX_API_KEY is not set — add it to .env (see .env.example) or rehearse with --dry-run');
			process.exit(2);
		}
	}

	const rest = driver.createRestClient({ dryRun });
	const cli = driver.createCliChannel({ dryRun, ...(opts.repoDir ? { repoDir: opts.repoDir } : {}) });

	const report = await driver.executePlan(plan, {
		rest,
		cli,
		checkpointDir: opts.checkpointDir ?? path.join('.vespasian', 'checkpoints'),
		resumeFrom: opts.resumeFrom ?? null,
	});

	const planDir = path.dirname(path.resolve(planPath));
	const reportPath = opts.report ? path.resolve(opts.report) : path.join(planDir, 'apply-report.json');
	await writeJson(reportPath, report);
	const fidelity = driver.buildFidelityReport({ translate: report.fidelity, pendingAgent: report.pendingAgent });
	driver.writeFidelityReport(fidelity, { outDir: planDir });

	if (!opts.quiet) {
		info(`apply${dryRun ? ' (dry-run)' : ''}: ${plan.site?.title ?? 'site'} — plan ${path.relative(process.cwd(), planPath)}`);
		for (const phase of report.phases) {
			const mark = phase.status === 'complete' ? 'ok     ' : phase.status === 'skipped' ? 'skipped' : 'FAILED ';
			info(`  ${mark} ${phase.phase} (${phase.steps} steps)`);
		}
		const failed = report.steps.filter((s) => s.status === 'failed');
		for (const step of failed) info(`  failed step ${step.id}: ${step.error}`);

		if (report.pendingAgent.length > 0) {
			info('');
			info(`${report.pendingAgent.length} step(s) need the Wix editor (no official API exists for them).`);
			info('Hand them to the wix-site-builder agent — in Claude Code, ask:');
			info(`  "Run the wix-site-builder agent on ${path.relative(process.cwd(), reportPath)}"`);
			for (const entry of report.pendingAgent.slice(0, 10)) {
				info(`  - ${entry.stepId} (${entry.op})`);
			}
			if (report.pendingAgent.length > 10) info(`  … and ${report.pendingAgent.length - 10} more (see apply-report.json)`);
		}
		info('');
		info(`reports: ${path.relative(process.cwd(), reportPath)}, fidelity-report.md`);
	}

	process.exit(report.ok ? 0 : 1);
}

// ---------------------------------------------------------------------------
// vespasian site create|use|list
// ---------------------------------------------------------------------------

async function runSite(args) {
	const [sub, ...rest] = args;
	if (!sub || sub === '-h' || sub === '--help') {
		printSiteUsage();
		process.exit(sub ? 0 : 2);
	}
	if (sub === 'create') return siteCreate(rest);
	if (sub === 'use') return siteUse(rest);
	if (sub === 'list') return siteList(rest);
	fail(`Unknown site subcommand: ${sub}`);
	printSiteUsage();
	process.exit(2);
}

async function siteCreate(args) {
	const { opts, positionals } = parseFlags(args, {
		templateId: { flags: ['--template-id'], value: true },
		dryRun: { flags: ['--dry-run'] },
		quiet: { flags: ['--quiet', '-q'] },
	}, printSiteUsage);

	const name = positionals[0];
	if (!name) {
		fail('a site name is required: vespasian site create "<name>"');
		printSiteUsage();
		process.exit(2);
	}

	const driver = await import(DRIVER);
	const dryRun = Boolean(opts.dryRun) || driver.isDryRunEnv();
	const client = driver.createRestClient({ dryRun });

	const result = await client.projects.createSite({
		name,
		...(opts.templateId ? { templateId: opts.templateId } : {}),
	});
	const project = result?.project ?? result;
	const siteId = project?.siteId;
	if (!siteId) throw new Error('site creation returned no siteId');

	// Studio-first guarantee: fail fast when the new site is not a Studio site.
	const urls = await client.editorUrls.getEditorUrls({ siteId });
	driver.assertEditorType(urls, 'WIX_STUDIO');

	if (dryRun) {
		info(`dry-run: would create site "${name}" and write WIX_SITE_ID to .env`);
		info(`  siteId: ${siteId} (canned)  editorType: ${driver.editorTypeOf(urls)}`);
	} else {
		const envFile = await updateEnvFile({ WIX_SITE_ID: siteId });
		if (!opts.quiet) {
			info(`site created: ${name}`);
			info(`  siteId:     ${siteId}`);
			if (project.metaSiteId) info(`  metaSiteId: ${project.metaSiteId}`);
			info(`  editorType: ${driver.editorTypeOf(urls)}`);
			if (urls.editorUrl) info(`  editor:     ${urls.editorUrl}`);
			info(`WIX_SITE_ID recorded in ${path.relative(process.cwd(), envFile)}`);
		}
	}
	process.exit(0);
}

async function siteUse(args) {
	const { opts, positionals } = parseFlags(args, {
		quiet: { flags: ['--quiet', '-q'] },
	}, printSiteUsage);

	const siteId = positionals[0];
	if (!siteId) {
		fail('a site id is required: vespasian site use <site-id>');
		printSiteUsage();
		process.exit(2);
	}

	const driver = await import(DRIVER);
	// Best-effort verification when credentials are available.
	const creds = driver.resolveApiCredentials();
	if (creds.apiKey && !driver.isDryRunEnv()) {
		try {
			const urls = await driver.createRestClient().editorUrls.getEditorUrls({ siteId });
			if (!opts.quiet) info(`verified: editorType ${driver.editorTypeOf(urls) ?? 'unknown'}`);
		} catch (err) {
			info(`warning: could not verify site ${siteId} (${err.message}) — recording it anyway`);
		}
	}

	const envFile = await updateEnvFile({ WIX_SITE_ID: siteId });
	if (!opts.quiet) info(`WIX_SITE_ID=${siteId} recorded in ${path.relative(process.cwd(), envFile)}`);
	process.exit(0);
}

async function siteList(args) {
	const { opts } = parseFlags(args, {
		dryRun: { flags: ['--dry-run'] },
		quiet: { flags: ['--quiet', '-q'] },
	}, printSiteUsage, { maxPositionals: 0 });

	const driver = await import(DRIVER);
	const dryRun = Boolean(opts.dryRun) || driver.isDryRunEnv();
	const client = driver.createRestClient({ dryRun });

	const result = await client.sites.querySites({});
	const sites = result?.sites ?? [];
	if (sites.length === 0) {
		info(dryRun ? 'no sites (dry-run fixtures return an empty list)' : 'no sites found for this account');
	} else {
		for (const site of sites) {
			process.stdout.write(`${site.id ?? site.siteId ?? '?'}  ${site.name ?? site.displayName ?? ''}\n`);
		}
	}
	process.exit(0);
}

// ---------------------------------------------------------------------------
// vespasian login --editor
// ---------------------------------------------------------------------------

async function runLogin(args) {
	const { opts } = parseFlags(args, {
		editor: { flags: ['--editor'] },
	}, printLoginUsage, { maxPositionals: 0 });

	if (!opts.editor) {
		fail('only editor login exists: vespasian login --editor');
		printLoginUsage();
		process.exit(2);
	}

	const driver = await import(DRIVER);

	if (driver.isDryRunEnv()) {
		info('dry-run: would prompt for editor-automation consent and open a headed browser at manage.wix.com.');
		info('No consent recorded, no browser launched.');
		process.exit(0);
	}

	if (!driver.hasConsent()) {
		info('Editor automation drives the Wix editor with a real browser where no official API exists.');
		info('It is a Wix Terms-of-Use gray area. Before enabling it, please read and acknowledge:');
		info('');
		info(`  ${driver.CONSENT_STATEMENT}`);
		info('');
		const answer = (await askLine('Acknowledge and enable editor automation? (yes/no) ')).trim().toLowerCase();
		if (answer !== 'y' && answer !== 'yes') {
			info('Cancelled — no consent recorded. Editor steps will surface as pending-agent work instead.');
			process.exit(1);
		}
		driver.recordConsent({ acknowledgedBy: process.env.USER ?? null });
		info(`Consent recorded at ${driver.consentPath()}.`);
	}

	const session = new driver.EditorSession();
	await session.launch({ interactive: true });
	const page = await session.page();
	await page.goto('https://manage.wix.com/', { waitUntil: 'domcontentloaded' }).catch(() => {});
	info('');
	info('A headed browser window is open. Log in to Wix there (solve any CAPTCHA/2FA yourself).');
	await askLine('When you are logged in, press Enter here to save the session… ');
	const statePath = await session.saveStorageState();
	await session.close();
	info(`Editor session saved to ${statePath}. Editor flows can now reuse it.`);
	process.exit(0);
}

// ---------------------------------------------------------------------------
// vespasian publish
// ---------------------------------------------------------------------------

async function runPublish(args) {
	const { opts } = parseFlags(args, {
		siteId: { flags: ['--site-id'], value: true },
		dryRun: { flags: ['--dry-run'] },
		config: { flags: ['--config'], value: true },
		quiet: { flags: ['--quiet', '-q'] },
	}, printPublishUsage, { maxPositionals: 0 });

	const driver = await import(DRIVER);
	const config = await loadConfig(opts.config);
	const dryRun = Boolean(opts.dryRun) || driver.isDryRunEnv();
	const siteId = opts.siteId ?? process.env.WIX_SITE_ID ?? config?.site?.siteId ?? undefined;

	if (!dryRun && !siteId) {
		fail('no target site — set WIX_SITE_ID (vespasian site create|use) or pass --site-id');
		process.exit(2);
	}

	const client = driver.createRestClient({ dryRun });
	await client.siteActions.publishSite({ siteId });
	if (!opts.quiet) info(`${dryRun ? 'dry-run: would publish' : 'publish requested for'} site ${siteId ?? '(fixture)'}`);

	try {
		const urls = await client.editorUrls.listPublishedSiteUrls({ siteId });
		const url = urls?.urls?.[0]?.url;
		if (url && !opts.quiet) info(`published URL: ${url}`);
	} catch {
		/* published URL is best-effort */
	}
	info('Note: REST publish ships editor content only; when Git-connected code changed, use `wix publish`.');
	process.exit(0);
}

// ---------------------------------------------------------------------------
// vespasian qa
// ---------------------------------------------------------------------------

async function runQa(args) {
	const { opts, positionals } = parseFlags(args, {
		siteId: { flags: ['--site-id'], value: true },
		outDir: { flags: ['--out-dir'], value: true },
		expect: { flags: ['--expect'], value: true },
		dryRun: { flags: ['--dry-run'] },
		config: { flags: ['--config'], value: true },
		quiet: { flags: ['--quiet', '-q'] },
	}, printQaUsage);

	const driver = await import(DRIVER);
	const config = await loadConfig(opts.config);
	const dryRun = Boolean(opts.dryRun) || driver.isDryRunEnv();

	let url = positionals[0];
	if (!url) {
		const siteId = opts.siteId ?? process.env.WIX_SITE_ID ?? config?.site?.siteId ?? undefined;
		const client = driver.createRestClient({ dryRun });
		const urls = await client.editorUrls.listPublishedSiteUrls({ siteId });
		url = urls?.urls?.[0]?.url;
		if (!url) {
			fail('no published URL found — pass one explicitly: vespasian qa <url>');
			process.exit(2);
		}
	}

	if (dryRun) {
		info(`dry-run: would capture ${driver.DEFAULT_WIDTHS.join('/')}px screenshots of ${url}`);
		if (opts.expect) info(`dry-run: would assert CSS variables from ${opts.expect}`);
		process.exit(0);
	}

	const shots = await driver.captureScreenshots(url, {
		...(opts.outDir ? { outDir: opts.outDir } : {}),
	});
	if (!opts.quiet) for (const shot of shots) info(`screenshot ${shot.width}px → ${shot.path}`);

	if (opts.expect) {
		const expected = JSON.parse(await fs.readFile(opts.expect, 'utf8'));
		const result = await driver.assertThemeVars(url, expected);
		if (result.ok) {
			if (!opts.quiet) info(`theme vars: all ${Object.keys(expected).length} match`);
		} else {
			for (const miss of result.mismatches) {
				info(`theme var mismatch ${miss.name}: expected ${miss.expected}, got ${miss.actual || '(unset)'}`);
			}
			process.exit(1);
		}
	}
	process.exit(0);
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

function printRootUsage() {
	process.stderr.write([
		'Vespasian — Claude Code-integrated Wix site builder.',
		'Design in (Figma · Canva · InDesign), live Wix site out.',
		'',
		'Usage: vespasian <command> [options]',
		'',
		'Commands:',
		'  init                        Project setup wizard (also: pnpm run init)',
		'  login --editor              One-time consent + headed Wix login (editor plane)',
		'  site create|use|list        Provision / select the target Wix site',
		'  pipeline indesign <input>   .idml/.pdf/IR → design artifacts + BuildPlan',
		'  plan <ir-or-artifact-dir>   Compile a BuildPlan (offline, no credentials)',
		'  apply <plan> [--dry-run]    Execute a BuildPlan against the Wix site',
		'  publish                     Publish the current editor state (REST)',
		'  qa [url]                    Published-site screenshots + theme-var checks',
		'',
		'VESPASIAN_DRY_RUN=1 (or --dry-run) turns every plane into a recording',
		'transport: no credentials, no network, no browser.',
		'',
		'Run `vespasian <command> --help` for command options.',
		'',
	].join('\n'));
}

function printPipelineUsage() {
	process.stderr.write([
		'Usage: vespasian pipeline <name> [options]',
		'',
		'Pipelines:',
		'  indesign <input>   .idml/.pdf (or IR JSON) → artifacts + Wix BuildPlan',
		'',
		'figma / canva conversions are Claude-Code-driven flows — see',
		'docs/figma-to-wix/ and docs/canva-to-wix/.',
		'',
		'Run `vespasian pipeline indesign --help` for options.',
		'',
	].join('\n'));
}

function printIndesignUsage() {
	process.stderr.write([
		'Usage: vespasian pipeline indesign <input> [options]',
		'',
		'Parse an InDesign document, derive the content model, map design tokens,',
		'stage assets, and compile a Wix BuildPlan. Artifacts land under',
		'.vespasian/plans/<slug>/: ir.json, content.json, tokens.json,',
		'assets.manifest.json, assets/, plan.json, plan-report.md.',
		'',
		'Arguments:',
		'  <input>                An .idml or .pdf file, a pre-parsed IR JSON, or - for stdin',
		'',
		'Options:',
		'      --plan <file>      BuildPlan output path (default: <plan-dir>/plan.json)',
		'  -o, --output <dir>     Plans parent directory (default: .vespasian/plans,',
		'                         or config pipeline.indesign.output)',
		'      --config <path>    Vespasian config (default: ./vespasian.config.json if present)',
		'      --slug <str>       Plan directory slug (default: from the document name)',
		'      --name <str>       Site display name (default: from the document name)',
		'      --template-id <id> Confirmed-Studio template GUID to seed the site from',
		'      --namespace <str>  Derived-token slug prefix (default: config or "id")',
		'      --asset-dir <dir>  Extra source of image bytes for unresolved links',
		'      --dpi <n>          DPI when parsing .idml/.pdf directly (default: 96)',
		'      --fluid            Emit fluid clamp() font sizes',
		'  -q, --quiet            Suppress the stderr summary',
		'  -h, --help             Show this help',
		'',
		'Config (vespasian.config.json):',
		'  { "pipeline": { "indesign": { "output", "namespace" } }, "site": { "siteId", "accountId" } }',
		'  CLI flags override config values. See vespasian.config.example.json.',
		'',
		'Examples:',
		'  vespasian pipeline indesign brochure.idml',
		'  vespasian pipeline indesign brochure.pdf --slug brochure --name "Brochure Site"',
		'  vespasian pipeline indesign - < ir.json --slug my-site',
		'',
	].join('\n'));
}

function printPlanUsage() {
	process.stderr.write([
		'Usage: vespasian plan <artifact-dir | ir.json | -> [options]',
		'',
		'Compile a BuildPlan from pipeline artifacts — offline and deterministic',
		'(same inputs, byte-identical plan). Accepts an artifact directory from',
		'`vespasian pipeline indesign`, or a raw IR / ingest-artifact JSON',
		'(tokens are then mapped on the fly).',
		'',
		'Options:',
		'      --out <file>        Write the plan here (default: <dir>/plan.json for',
		'                          a directory input, stdout for a file input)',
		'      --site-title <str>  Site display name override',
		'      --template-id <id>  Confirmed-Studio template GUID',
		'  -q, --quiet             Suppress the stderr summary',
		'  -h, --help              Show this help',
		'',
	].join('\n'));
}

function printApplyUsage() {
	process.stderr.write([
		'Usage: vespasian apply <plan.json> [options]',
		'',
		'Execute a BuildPlan phase by phase (provision → media → data → editor →',
		'code → properties → publish → qa) over the REST + CLI channels.',
		'Editor/agent steps are recorded as pending-agent work for the',
		'wix-site-builder agent — never silent failures. Progress is checkpointed',
		'so interrupted runs can resume.',
		'',
		'Options:',
		'      --dry-run              Recording transports only: no credentials, no network',
		'      --resume-from <phase>  Resume at a phase (' + PHASES.join(', ') + ')',
		'      --repo-dir <dir>       Git-integration working copy for the code phase',
		'      --checkpoint-dir <dir> Checkpoint dir (default: .vespasian/checkpoints)',
		'      --report <file>        Run-report path (default: <plan-dir>/apply-report.json)',
		'  -q, --quiet                Suppress the stderr summary',
		'  -h, --help                 Show this help',
		'',
		'Live runs need WIX_API_KEY + WIX_ACCOUNT_ID in .env (see .env.example).',
		'Run from the project root so staged asset paths resolve.',
		'',
	].join('\n'));
}

function printSiteUsage() {
	process.stderr.write([
		'Usage: vespasian site <create|use|list> [options]',
		'',
		'  site create <name> [--template-id <guid>]',
		'      Create a Wix site via the API, assert it is a Studio site, and',
		'      record WIX_SITE_ID in .env.',
		'  site use <site-id>',
		'      Record an existing site as the default target (writes WIX_SITE_ID',
		'      to .env; verified against the API when credentials are set).',
		'  site list',
		'      List sites in the account (needs WIX_API_KEY + WIX_ACCOUNT_ID).',
		'',
		'Options: --dry-run, --quiet, --help.',
		'',
	].join('\n'));
}

function printLoginUsage() {
	process.stderr.write([
		'Usage: vespasian login --editor',
		'',
		'One-time setup for the editor-automation plane:',
		'  1. shows the consent statement (Wix ToU gray area — explicit opt-in only)',
		'  2. opens a HEADED browser at manage.wix.com; you log in yourself',
		'     (CAPTCHA/2FA are yours to solve — never automated)',
		'  3. persists the session to .vespasian/session/state.json for reuse',
		'',
		'Without this, editor steps in `vespasian apply` surface as pending-agent',
		'work instead of running.',
		'',
	].join('\n'));
}

function printPublishUsage() {
	process.stderr.write([
		'Usage: vespasian publish [--site-id <id>] [--dry-run]',
		'',
		'Publish the current editor state of the target site via the REST API.',
		'The target comes from --site-id, WIX_SITE_ID, or vespasian.config.json',
		'(site.siteId). REST publish ships editor content only — after code',
		'changes in a Git-connected repo, `wix publish` is the correct path.',
		'',
	].join('\n'));
}

function printQaUsage() {
	process.stderr.write([
		'Usage: vespasian qa [url] [options]',
		'',
		'Capture published-site screenshots at the Studio breakpoints',
		'(1280/900/375) and optionally assert computed CSS custom properties',
		'against expected values. Without a url, the published URL is resolved',
		'from the target site.',
		'',
		'Options:',
		'      --site-id <id>    Target site (default: WIX_SITE_ID / config)',
		'      --out-dir <dir>   Screenshot dir (default: .vespasian/qa/screenshots)',
		'      --expect <file>   JSON of { "--wst-…"/"--vsp-…": "expected" } to assert',
		'      --dry-run         Print the intended captures without a browser',
		'  -q, --quiet           Suppress per-file output',
		'  -h, --help            Show this help',
		'',
	].join('\n'));
}

main().catch((err) => {
	fail(err.message);
	process.exit(1);
});
