// Structured escalation — the editor plane's "I need a human/agent" signal.
//
// Flows never throw raw Playwright errors upward: when cached selectors fail
// or the UI diverges, they return an EscalationRequest so the executor can
// surface a 'pending-agent' entry (screenshot-grounded agent or human takes
// over) instead of failing the run.

/**
 * @typedef {Object} EscalationRequest
 * @property {true} escalation
 * @property {string} flow            Flow name (e.g. 'themeColors').
 * @property {string} step            Step within the flow that failed/needs an agent.
 * @property {string} [screenshotPath]
 * @property {string} hint            What the agent/human should do next.
 * @property {unknown} [detail]       Original error message or context.
 */

/** @returns {EscalationRequest} */
export function escalate({ flow, step, hint, screenshotPath, detail }) {
	return {
		escalation: true,
		flow,
		step,
		hint,
		...(screenshotPath ? { screenshotPath } : {}),
		...(detail !== undefined ? { detail } : {}),
	};
}

export function isEscalation(value) {
	return Boolean(value) && typeof value === 'object' && value.escalation === true;
}

/**
 * Run a flow step; convert any thrown error into an EscalationRequest,
 * attaching a screenshot when a page is available.
 *
 * @param {{ flow: string, step: string, hint: string, page?: import('playwright').Page, screenshotDir?: string }} ctx
 * @param {() => Promise<any>} fn
 */
export async function tryStep(ctx, fn) {
	try {
		return await fn();
	} catch (error) {
		let screenshotPath;
		if (ctx.page && ctx.screenshotDir) {
			try {
				const { mkdirSync } = await import('node:fs');
				const { join } = await import('node:path');
				mkdirSync(ctx.screenshotDir, { recursive: true });
				screenshotPath = join(ctx.screenshotDir, `${ctx.flow}-${ctx.step}.png`);
				await ctx.page.screenshot({ path: screenshotPath, fullPage: false });
			} catch {
				screenshotPath = undefined; // screenshot is best-effort
			}
		}
		return escalate({
			flow: ctx.flow,
			step: ctx.step,
			hint: ctx.hint,
			screenshotPath,
			detail: error?.message ?? String(error),
		});
	}
}
