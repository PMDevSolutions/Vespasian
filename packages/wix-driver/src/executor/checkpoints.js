// Phase checkpoints — the substrate of `vespasian apply --resume-from`.
//
// After every executed phase the executor writes a checkpoint JSON under
// .vespasian/checkpoints/ keyed by the plan's sourceHash, recording completed
// steps and accumulated run state (siteId, uploaded files, ...). A phase that
// FAILED is never recorded as completed: `lastCompletedPhase` stays at the
// previous successful phase and the failure lands in `failedPhase` instead.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_CHECKPOINT_DIR = join('.vespasian', 'checkpoints');

export function checkpointPath({ dir = DEFAULT_CHECKPOINT_DIR, sourceHash }) {
	return join(dir, `${sourceHash.slice(0, 16)}.json`);
}

export function loadCheckpoint({ dir, sourceHash }) {
	const path = checkpointPath({ dir, sourceHash });
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		return null;
	}
}

export function saveCheckpoint({ dir = DEFAULT_CHECKPOINT_DIR, sourceHash, phase, failedPhase, completedSteps, state }) {
	mkdirSync(dir, { recursive: true });
	const path = checkpointPath({ dir, sourceHash });
	const checkpoint = {
		sourceHash,
		lastCompletedPhase: phase ?? null,
		...(failedPhase ? { failedPhase } : {}),
		completedSteps,
		state,
		savedAt: new Date().toISOString(),
	};
	writeFileSync(path, `${JSON.stringify(checkpoint, null, '\t')}\n`);
	return path;
}
