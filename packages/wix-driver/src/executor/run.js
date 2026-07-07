// Phase-ordered BuildPlan executor.
//
// Runs steps grouped by the canonical phase order (provision → media → data →
// editor → code → properties → publish → qa) over pluggable transports
// { rest, cli, editor }. Editor/agent steps without an attached editor driver
// — and every EscalationRequest a flow returns — become structured
// 'pending-agent' entries in the run report, NOT failures: a plan run that
// needs the wix-site-builder agent is still a successful compile-and-apply of
// everything automatable.
//
// onFail semantics per step: 'retry' (2 extra attempts), 'escalate'
// (pending-agent), 'skip-and-report' (skipped + note).

import { isEscalation } from '../editor/escalation.js';
import { BuildPlanSchema, PHASES } from '../plan/schema.js';
import { isFileReady } from '../rest/media.js';
import { note } from '../translate/schemas.js';
import { handlerFor } from './ops.js';
import { loadCheckpoint, saveCheckpoint } from './checkpoints.js';

const RETRY_ATTEMPTS = 3; // total tries for onFail: 'retry'

/**
 * @param {object} rawPlan  A BuildPlan (validated here).
 * @param {Object} options
 * @param {object} options.rest      REST client (live or dry-run).
 * @param {object} [options.cli]     CLI channel (createCliChannel()).
 * @param {object} [options.editor]  Editor driver: { runFlow(op, input, state) }.
 * @param {string} [options.checkpointDir]  Default .vespasian/checkpoints.
 * @param {string|null} [options.resumeFrom]  Phase name to resume from (earlier phases are skipped).
 * @param {boolean} [options.checkpoints]  Write checkpoint files (default true when checkpointDir given).
 * @returns {Promise<object>} RunReport
 */
export async function executePlan(rawPlan, options) {
	const plan = BuildPlanSchema.parse(rawPlan);
	const { rest, cli, editor, checkpointDir, resumeFrom = null } = options;
	const writeCheckpoints = options.checkpoints ?? Boolean(checkpointDir);

	if (resumeFrom && !PHASES.includes(resumeFrom)) {
		throw new Error(`Unknown --resume-from phase "${resumeFrom}" (expected one of ${PHASES.join(', ')})`);
	}
	const startIndex = resumeFrom ? PHASES.indexOf(resumeFrom) : 0;

	const ctx = { rest, cli, editor, state: {} };
	const report = {
		planVersion: plan.planVersion,
		site: plan.site,
		sourceHash: plan.meta.sourceHash,
		resumeFrom,
		phases: [],
		steps: [],
		pendingAgent: [],
		fidelity: [...plan.fidelity],
		ok: true,
	};

	const recordStep = (entry) => {
		report.steps.push(entry);
		return entry;
	};

	// --resume-from: restore accumulated run state (siteId, uploaded files, …)
	// from the checkpoint for this plan, and refuse to silently skip phases the
	// checkpoint does not record as completed.
	let lastCompletedPhase = null;
	if (resumeFrom) {
		const checkpoint = loadCheckpoint({ dir: checkpointDir, sourceHash: plan.meta.sourceHash });
		if (checkpoint) {
			ctx.state = { ...(checkpoint.state ?? {}) };
			lastCompletedPhase = checkpoint.lastCompletedPhase ?? null;
			const lastIdx = lastCompletedPhase ? PHASES.indexOf(lastCompletedPhase) : -1;
			const skippedIncomplete = PHASES.filter(
				(phase, i) => i < startIndex && i > lastIdx && plan.steps.some((s) => s.phase === phase),
			);
			if (skippedIncomplete.length > 0) {
				throw new Error(
					`--resume-from ${resumeFrom} would skip phase(s) the checkpoint does not record as completed: ` +
						`${skippedIncomplete.join(', ')} (last completed phase: ${lastCompletedPhase ?? 'none'}` +
						`${checkpoint.failedPhase ? `, failed phase: ${checkpoint.failedPhase}` : ''})`,
				);
			}
		} else {
			report.fidelity.push(
				note(
					'executor.resume-no-checkpoint',
					'warn',
					`No checkpoint found for this plan (sourceHash ${plan.meta.sourceHash.slice(0, 16)}…) — resuming from "${resumeFrom}" with empty run state; site-scoped steps fall back to WIX_SITE_ID.`,
				),
			);
		}
	}

	// Pages-before-code sequencing: pending-agent editor steps mean pages were
	// NOT actually created (only recorded for the wix-site-builder agent).
	let editorPendingSteps = 0;

	for (const [phaseIndex, phase] of PHASES.entries()) {
		const phaseSteps = plan.steps.filter((step) => step.phase === phase);
		if (phaseSteps.length === 0) continue;

		if (phaseIndex < startIndex) {
			for (const step of phaseSteps) {
				recordStep({ id: step.id, op: step.op, phase, status: 'skipped', reason: `resumed from ${resumeFrom}` });
			}
			report.phases.push({ phase, status: 'skipped', steps: phaseSteps.length });
			continue;
		}

		// Sequencing rule: page/code ordering — code pushes only after the
		// editor phase actually completed. Editor steps that went pending-agent
		// leave pages uncreated, so a LIVE run keeps the cli.push/publish guard
		// closed; dry-run counts them as done-for-sequencing (the staging CLI
		// channel never pushes real code). A resume that skipped the editor
		// phase implies a previous run completed it.
		if (phase === 'code' && ctx.cli?.setPagesReady) {
			const editorSkippedByResume = startIndex > PHASES.indexOf('editor');
			ctx.cli.setPagesReady(editorSkippedByResume || editorPendingSteps === 0 || Boolean(ctx.rest?.dryRun));
		}

		let phaseFailed = false;
		for (const step of phaseSteps) {
			const entry = await executeStep(ctx, step, report);
			recordStep(entry);
			if (phase === 'editor' && entry.status === 'pending-agent') editorPendingSteps += 1;
			if (entry.status === 'failed') {
				phaseFailed = true;
				break; // a hard failure stops the run; checkpoint allows resume
			}
		}

		report.phases.push({
			phase,
			status: phaseFailed ? 'failed' : 'complete',
			steps: phaseSteps.length,
		});

		if (!phaseFailed) lastCompletedPhase = phase;

		// A failed phase is never checkpointed as completed: lastCompletedPhase
		// stays at the previous successful phase and the failure is recorded
		// separately so --resume-from targets the right phase.
		if (writeCheckpoints) {
			saveCheckpoint({
				dir: checkpointDir,
				sourceHash: plan.meta.sourceHash,
				phase: lastCompletedPhase,
				...(phaseFailed ? { failedPhase: phase } : {}),
				completedSteps: report.steps.filter((s) => s.status === 'ok').map((s) => s.id),
				state: ctx.state,
			});
		}

		if (phaseFailed) {
			report.ok = false;
			return report;
		}
	}

	report.ok = report.steps.every((s) => s.status !== 'failed');
	return report;
}

async function executeStep(ctx, step, report) {
	const base = { id: step.id, op: step.op, phase: step.phase, method: step.method };

	// Editor-plane steps (playwright + agent) go through the editor driver.
	if (step.method === 'playwright' || step.method === 'agent') {
		if (!ctx.editor || (step.method === 'agent' && typeof ctx.editor.runAgentStep !== 'function' && typeof ctx.editor.runFlow !== 'function')) {
			return pending(ctx, report, step, base, {
				hint: `No editor driver attached — hand "${step.op}" to the wix-site-builder agent (input in the BuildPlan step).`,
			});
		}
		try {
			const runner = step.method === 'agent' && typeof ctx.editor.runAgentStep === 'function'
				? ctx.editor.runAgentStep.bind(ctx.editor)
				: ctx.editor.runFlow.bind(ctx.editor);
			const result = await runner(step.op, step.input, ctx.state);
			if (isEscalation(result)) {
				return pending(ctx, report, step, base, result);
			}
			const entry = { ...base, status: 'ok', attempts: 1, output: summarize(result) };
			if (step.verify) entry.verify = await verifyStep(ctx, report, step, result);
			return entry;
		} catch (error) {
			return applyOnFail(ctx, report, step, base, error, 1);
		}
	}

	const handler = handlerFor(step);
	if (!handler) {
		return applyOnFail(ctx, report, step, base, new Error(`No handler registered for op "${step.op}"`), 0);
	}
	if (step.method === 'cli' && !ctx.cli) {
		return applyOnFail(ctx, report, step, base, new Error('No CLI channel attached'), 0);
	}

	const maxAttempts = step.onFail === 'retry' ? RETRY_ATTEMPTS : 1;
	let lastError;
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			const result = await handler(ctx, step.input);
			const entry = { ...base, status: 'ok', attempts: attempt, output: summarize(result) };
			if (step.verify) entry.verify = await verifyStep(ctx, report, step, result);
			return entry;
		} catch (error) {
			lastError = error;
		}
	}
	return applyOnFail(ctx, report, step, base, lastError, maxAttempts);
}

/**
 * Evaluate a step's `verify` clause after the step succeeded.
 *
 * Evaluated asserts:
 *   file-ready   the media result must be a READY file descriptor (polled via
 *                the same transport when it is not yet ready) — a failure here
 *                fails the step under its normal onFail semantics.
 *   editorType   enforced inside the op handler itself (site.assertStudio
 *                throws on a mismatch), so reaching here means it held.
 * Every other assert (published-url-reachable, wst-*-vars, …) is advisory: it
 * describes what the QA phase / wix-site-builder agent must confirm, and is
 * surfaced as a fidelity note instead of being silently ignored.
 */
async function verifyStep(ctx, report, step, result) {
	const assert = step.verify?.assert;
	if (assert === 'file-ready') {
		const file = result?.file ?? result;
		if (isFileReady(file)) return { assert, status: 'ok' };
		if (file?.id && ctx.rest?.media?.waitForFileReady) {
			await ctx.rest.media.waitForFileReady({ fileId: file.id, siteId: ctx.state.siteId });
			return { assert, status: 'ok' };
		}
		throw new Error(`verify failed for step ${step.id}: media file is not ready (${JSON.stringify(file ?? null)})`);
	}
	if (assert === 'editorType') {
		return { assert, status: 'ok' };
	}
	report.fidelity.push(
		note(
			'executor.verify-advisory',
			'info',
			`Step ${step.id} verify "${assert}" is not auto-evaluated by the executor — confirm it via the QA phase or the wix-site-builder agent.`,
			{ stepId: step.id, assert },
		),
	);
	return { assert, status: 'advisory' };
}

function applyOnFail(ctx, report, step, base, error, attempts) {
	const message = error?.message ?? String(error);
	if (step.onFail === 'escalate') {
		return pending(ctx, report, step, base, { hint: `Step failed: ${message}`, detail: message });
	}
	if (step.onFail === 'skip-and-report') {
		report.fidelity.push({
			code: 'executor.step-skipped',
			severity: 'warn',
			message: `Step ${step.id} (${step.op}) skipped after failure: ${message}`,
		});
		return { ...base, status: 'skipped', attempts, reason: message };
	}
	return { ...base, status: 'failed', attempts, error: message };
}

function pending(ctx, report, step, base, escalation) {
	report.pendingAgent.push({
		stepId: step.id,
		op: step.op,
		phase: step.phase,
		method: step.method,
		input: step.input,
		hint: escalation.hint ?? `Execute "${step.op}" in the editor (screenshot-grounded).`,
		...(escalation.flow ? { flow: escalation.flow, flowStep: escalation.step } : {}),
		...(escalation.screenshotPath ? { screenshotPath: escalation.screenshotPath } : {}),
		...(escalation.detail !== undefined ? { detail: escalation.detail } : {}),
	});
	return { ...base, status: 'pending-agent', attempts: 1 };
}

/** Keep run reports readable: cap huge outputs. */
function summarize(result) {
	if (result === undefined || result === null) return null;
	try {
		const text = JSON.stringify(result);
		if (text.length <= 2_000) return result;
		return { truncated: true, preview: `${text.slice(0, 500)}…` };
	} catch {
		return { unserializable: true };
	}
}
