// FidelityReport — honest degradation reporting, replacing the WordPress
// target's "pixel-perfect" promise. Merges translate-time losses with
// executor-time notes and pending-agent escalations into one artifact
// (JSON + Markdown).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SEVERITY_ORDER = { error: 0, warn: 1, info: 2 };

/** Locale-independent codepoint comparator — report output must be byte-identical across machines. */
function compareStrings(a, b) {
	return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Merge note sources into a single sorted FidelityReport object.
 * @param {Object} sources
 * @param {Array<object>} [sources.translate]  Notes from translateTokens().
 * @param {Array<object>} [sources.executor]   report.fidelity from executePlan().
 * @param {Array<object>} [sources.pendingAgent]  report.pendingAgent entries.
 */
export function buildFidelityReport({ translate = [], executor = [], pendingAgent = [] } = {}) {
	const seen = new Set();
	const notes = [];
	for (const note of [...translate, ...executor]) {
		const key = `${note.code}:${note.message}`;
		if (seen.has(key)) continue;
		seen.add(key);
		notes.push(note);
	}
	notes.sort(
		(a, b) =>
			(SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3) ||
			compareStrings(a.code, b.code) ||
			compareStrings(a.message, b.message),
	);

	return {
		summary: {
			total: notes.length,
			errors: notes.filter((n) => n.severity === 'error').length,
			warnings: notes.filter((n) => n.severity === 'warn').length,
			info: notes.filter((n) => n.severity === 'info').length,
			pendingAgentSteps: pendingAgent.length,
		},
		notes,
		pendingAgent,
	};
}

/** Render the report as Markdown. */
export function renderFidelityMarkdown(report) {
	const lines = ['# Fidelity Report', ''];
	const { summary } = report;
	lines.push(
		`**${summary.total}** note(s) — ${summary.errors} error, ${summary.warnings} warning, ${summary.info} info. ` +
			`**${summary.pendingAgentSteps}** step(s) awaiting the wix-site-builder agent.`,
		'',
	);

	if (report.notes.length > 0) {
		lines.push('## Translation & execution losses', '', '| Severity | Code | Detail |', '|---|---|---|');
		for (const note of report.notes) {
			lines.push(`| ${note.severity} | \`${note.code}\` | ${note.message.replaceAll('|', '\\|')} |`);
		}
		lines.push('');
	}

	if (report.pendingAgent.length > 0) {
		lines.push('## Pending agent steps', '');
		for (const entry of report.pendingAgent) {
			lines.push(`- **${entry.stepId}** (\`${entry.op}\`, ${entry.phase}): ${entry.hint}`);
		}
		lines.push('');
	}

	if (report.notes.length === 0 && report.pendingAgent.length === 0) {
		lines.push('No fidelity losses recorded.', '');
	}
	return lines.join('\n');
}

/**
 * Write report.json + report.md.
 * @param {object} report  From buildFidelityReport().
 * @param {{ outDir?: string }} [options]
 */
export function writeFidelityReport(report, { outDir = join('.vespasian', 'qa') } = {}) {
	mkdirSync(outDir, { recursive: true });
	const jsonPath = join(outDir, 'fidelity-report.json');
	const mdPath = join(outDir, 'fidelity-report.md');
	writeFileSync(jsonPath, `${JSON.stringify(report, null, '\t')}\n`);
	writeFileSync(mdPath, renderFidelityMarkdown(report));
	return { jsonPath, mdPath };
}
