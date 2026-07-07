import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listPlanDirs } from '../../../src/core/project/list-plans';

test('listPlanDirs lists only plan dirs that contain a compiled plan.json (sorted)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vespasian-plans-'));
  try {
    const plans = join(root, '.vespasian', 'plans');
    await mkdir(join(plans, 'beta'), { recursive: true });
    await writeFile(join(plans, 'beta', 'plan.json'), '{}');
    await mkdir(join(plans, 'alpha'), { recursive: true });
    await writeFile(join(plans, 'alpha', 'plan.json'), '{}');
    // artifacts-only dir (no compiled plan) and a stray file are ignored
    await mkdir(join(plans, 'incomplete'), { recursive: true });
    await writeFile(join(plans, 'incomplete', 'ir.json'), '{}');
    await writeFile(join(plans, 'readme.txt'), 'x');
    assert.deepEqual(await listPlanDirs(root), ['alpha', 'beta']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('listPlanDirs returns [] when .vespasian/plans is absent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vespasian-noplans-'));
  try {
    assert.deepEqual(await listPlanDirs(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
