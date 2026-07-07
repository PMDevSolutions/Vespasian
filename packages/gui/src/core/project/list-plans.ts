import { promises as fs } from 'node:fs';
import { join } from 'node:path';

/**
 * List the compiled BuildPlan slugs under <repoRoot>/.vespasian/plans — the
 * directories that contain a plan.json (produced by `vespasian pipeline` /
 * `vespasian plan`). Feeds the Wix-site screen's apply picker.
 */
export async function listPlanDirs(repoRoot: string): Promise<string[]> {
  const plansDir = join(repoRoot, '.vespasian', 'plans');
  let entries;
  try {
    entries = await fs.readdir(plansDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const slugs: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      await fs.access(join(plansDir, entry.name, 'plan.json'));
      slugs.push(entry.name);
    } catch {
      /* artifacts without a compiled plan are not applyable */
    }
  }
  return slugs.sort();
}
