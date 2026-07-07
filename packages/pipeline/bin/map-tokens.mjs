#!/usr/bin/env node
// CLI: map an InDesign IR to neutral design tokens.
//
//   vespasian-map-tokens <ir.json | doc.idml | doc.pdf | -> [options]
//
// Reads a validated IR JSON (from parse-idml / parse-pdf) on a path or stdin,
// or parses an .idml/.pdf directly. Prints the tokens artifact — token groups
// (palette, fontSizes, fontFamilies, spacingSizes), DTCG designTokens, and the
// report with provenance maps — on stdout and a summary on stderr. With
// --out-dir, also writes the artifact set.
//
// Options:
//   --out-dir <dir>     Write tokens.json, design-tokens.json, and report.json here.
//   --base <path>       Base token set JSON (default: bundled config/base-tokens.json).
//   --font-map <path>   Font map JSON (default: bundled config/font-map.json).
//   --namespace <str>   Derived-token slug prefix (default: id).
//   --grid <px>         Spacing quantization grid (default: 4).
//   --tolerance <n>     Color dedupe/reuse squared-distance tolerance.
//   --type-tolerance <px> Typography size clustering tolerance (default: 1).
//   --dpi <n>           DPI when parsing .idml/.pdf directly (default: 96).
//   --fluid             Emit fluid clamp() font sizes.
//   --quiet             Suppress the stderr report summary.
//   -h, --help          Show this help.

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { parseIdml } from '../src/indesign/parse-idml.js';
import { parsePdf } from '../src/indesign/parse-pdf.js';
import { mapTokens } from '../src/indesign/map/index.js';

const args = process.argv.slice(2);
const opts = { fluid: false, quiet: false };
let inputPath;

function wantsValue(flag) {
	const next = args[i + 1];
	if (next === undefined || next.startsWith('-')) {
		process.stderr.write(`${flag} requires a value\n`);
		process.exit(2);
	}
	return next;
}

let i = 0;
for (; i < args.length; i += 1) {
	const arg = args[i];
	switch (arg) {
		case '--out-dir': opts.outDir = wantsValue(arg); i += 1; break;
		case '--base': opts.base = wantsValue(arg); i += 1; break;
		case '--font-map': opts.fontMap = wantsValue(arg); i += 1; break;
		case '--namespace': opts.namespace = wantsValue(arg); i += 1; break;
		case '--grid': opts.gridPx = Number(wantsValue(arg)); i += 1; break;
		case '--tolerance': opts.tolerance = Number(wantsValue(arg)); i += 1; break;
		case '--type-tolerance': opts.tolerancePx = Number(wantsValue(arg)); i += 1; break;
		case '--dpi': opts.dpi = Number(wantsValue(arg)); i += 1; break;
		case '--fluid': opts.fluid = true; break;
		case '--quiet': opts.quiet = true; break;
		case '-h': case '--help': printUsage(); process.exit(0); break;
		default:
		    if (!inputPath && (arg === '-' || !arg.startsWith('-'))) {
				inputPath = arg;
			} else {
				process.stderr.write(`Unknown argument: ${arg}\n`);
				printUsage();
				process.exit(2);
			}
	}
}

async function readStdin() {
	const chunks = [];
	for await (const chunk of process.stdin) chunks.push(chunk);
	return Buffer.concat(chunks).toString('utf8');
}

async function loadIr() {
	const dpiOpt = opts.dpi !== undefined ? { dpi: opts.dpi } : undefined;
	if (inputPath && /\.idml$/i.test(inputPath)) return parseIdml(inputPath, dpiOpt);
	if (inputPath && /\.pdf$/i.test(inputPath)) return parsePdf(inputPath, dpiOpt);
	const text = inputPath && inputPath !== '-' ? await fs.readFile(inputPath, 'utf8') : await readStdin();
	return JSON.parse(text);
}

try {
	const ir = await loadIr();
	const tokens = mapTokens(ir, {
		base: opts.base,
		fontMap: opts.fontMap,
		namespace: opts.namespace,
		gridPx: opts.gridPx,
		tolerance: opts.tolerance,
		tolerancePx: opts.tolerancePx,
		fluid: opts.fluid,
	});
	const { designTokens, report } = tokens;

	if (opts.outDir) {
		await fs.mkdir(opts.outDir, { recursive: true });
		const write = (name, value) => fs.writeFile(path.join(opts.outDir, name), `${JSON.stringify(value, null, 2)}\n`);
		await Promise.all([
			write('tokens.json', tokens),
			write('design-tokens.json', designTokens),
			write('report.json', report),
		]);
	}

	if (!opts.quiet) {
		const lines = [
			`tokens: palette ${tokens.palette.length}  font sizes ${tokens.fontSizes.length}  font families ${tokens.fontFamilies.length}  spacing ${tokens.spacingSizes.length}`,
			`swatches: ${report.counts.swatches}  fonts: ${report.counts.fonts}  styles: ${report.counts.styles}`,
		];
		if (report.fontFallbacks.length) lines.push(`font fallbacks: ${report.fontFallbacks.length}`);
		if (report.outOfGamut.length) lines.push(`out-of-gamut colors: ${report.outOfGamut.length}`);
		if (report.googleFonts.length) lines.push(`fonts to provision: ${report.googleFonts.map((g) => g.name).join(', ')}`);
		process.stderr.write(`${lines.join('\n')}\n`);
	}

	process.stdout.write(`${JSON.stringify(tokens, null, 2)}\n`);
	process.exit(0);
} catch (err) {
	process.stderr.write(`error: ${err.message}\n`);
	process.exit(1);
}

function printUsage() {
	process.stderr.write(
		[
			'Usage: vespasian-map-tokens <ir.json | doc.idml | doc.pdf | -> [options]',
			'',
			'Options:',
			'  --out-dir <dir>        Write all artifacts (tokens, DTCG tokens, report) here',
			'  --base <path>          Base token set JSON (default: bundled config/base-tokens.json)',
			'  --font-map <path>      Font map JSON (default: bundled config/font-map.json)',
			'  --namespace <str>      Derived-token slug prefix (default: id)',
			'  --grid <px>            Spacing quantization grid (default: 4)',
			'  --tolerance <n>        Color dedupe/reuse squared-distance tolerance',
			'  --type-tolerance <px>  Typography size clustering tolerance (default: 1)',
			'  --dpi <n>              DPI when parsing .idml/.pdf directly (default: 96)',
			'  --fluid                Emit fluid clamp() font sizes',
			'  --quiet                Suppress the stderr report summary',
			'  -h, --help             Show this help',
			'',
		].join('\n'),
	);
}
