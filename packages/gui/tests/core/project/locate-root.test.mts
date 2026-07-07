import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { locateRepoRoot, validateRepoRoot } from '../../../src/core/project/locate-root';
import { vespasianManifest } from '../../../src/shared/product/vespasian';

const project = vespasianManifest.project;

async function makeVespasianRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'vespasian-gui-test-'));
  await mkdir(join(root, 'bin'), { recursive: true });
  await writeFile(join(root, 'bin', 'vespasian.mjs'), '// cli\n');
  await mkdir(join(root, 'scripts'), { recursive: true });
  await writeFile(join(root, 'scripts', 'check-prerequisites.sh'), '#!/bin/bash\n');
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'vespasian' }));
  return root;
}

test('locateRepoRoot walks up to find the project root', async () => {
  const root = await makeVespasianRoot();
  try {
    const nested = join(root, 'a', 'b', 'c');
    await mkdir(nested, { recursive: true });
    const ref = await locateRepoRoot(nested, project);
    assert.equal(ref.valid, true);
    assert.equal(ref.root, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('validateRepoRoot rejects a non-Vespasian directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'not-vespasian-'));
  try {
    const ref = await validateRepoRoot(dir, project);
    assert.equal(ref.valid, false);
    assert.ok(ref.reason);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
