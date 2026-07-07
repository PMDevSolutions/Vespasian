import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_PRODUCT_ID,
  PRODUCTS,
  activeManifest,
  getScreen,
  getStep,
  initModuleDir,
  soleStep,
} from '../../../src/shared/product';
import { vespasianManifest } from '../../../src/shared/product/vespasian';

// Proves the shell renders its catalog (brand, screens, steps) from the manifest, and
// that the Vespasian manifest describes the Wix-retargeted catalog.

test('the active product is Vespasian', () => {
  assert.equal(ACTIVE_PRODUCT_ID, 'vespasian');
  // The active manifest is the one registered under that id (same registry instance).
  assert.equal(activeManifest, PRODUCTS.vespasian);
  assert.equal(activeManifest.id, 'vespasian');
  assert.equal(activeManifest.displayName, 'Vespasian');
});

test('Vespasian exposes the five expected screens, in order, with their nav labels', () => {
  assert.deepEqual(
    vespasianManifest.screens.map((s) => s.id),
    ['prereq', 'wizard', 'site', 'pipeline', 'qa'],
  );
  assert.deepEqual(
    vespasianManifest.screens.map((s) => s.navLabel),
    ['Prerequisites', 'Setup wizard', 'Wix site', 'Convert design', 'Visual QA'],
  );
});

test('the Wix-site screen lists the site lifecycle vocabulary', () => {
  const ids = getScreen(vespasianManifest, 'site').steps.map((s) => s.id);
  assert.deepEqual(ids, ['list', 'use', 'apply', 'publish']);
});

test('every site step runs bin/vespasian.mjs (nodeBin)', () => {
  for (const step of getScreen(vespasianManifest, 'site').steps) {
    assert.equal(step.command.exec, 'nodeBin');
    if (step.command.exec === 'nodeBin') {
      assert.equal(step.command.script, 'bin/vespasian.mjs');
    }
  }
});

test('every step has a label and a task kind; every screen has steps', () => {
  for (const screen of vespasianManifest.screens) {
    assert.ok(screen.steps.length > 0, `${screen.id} has no steps`);
    for (const step of screen.steps) {
      assert.ok(step.label.length > 0, `${screen.id}/${step.id} missing label`);
      assert.ok(String(step.taskKind).length > 0, `${screen.id}/${step.id} missing taskKind`);
    }
  }
});

test('task kinds reuse the shared vocabulary the engine already emits', () => {
  assert.equal(soleStep(vespasianManifest, 'prereq').taskKind, 'prereq-check');
  assert.equal(soleStep(vespasianManifest, 'wizard').taskKind, 'init');
  assert.equal(getStep(getScreen(vespasianManifest, 'site'), 'publish').taskKind, 'site:publish');
  assert.equal(getStep(getScreen(vespasianManifest, 'pipeline'), 'figma').taskKind, 'pipeline:figma');
  assert.equal(getStep(getScreen(vespasianManifest, 'qa'), 'lighthouse:run').taskKind, 'qa:lighthouse:run');
});

test('the pipeline screen drives the three design sources with the right descriptors', () => {
  const pipeline = getScreen(vespasianManifest, 'pipeline');
  assert.deepEqual(
    pipeline.steps.map((s) => s.id),
    ['figma', 'canva', 'indesign'],
  );
  assert.equal(getStep(pipeline, 'figma').command.exec, 'claude');
  assert.equal(getStep(pipeline, 'canva').command.exec, 'claude');
  assert.equal(getStep(pipeline, 'indesign').command.exec, 'nodeBin');
  // Reference docs point at the Wix pipeline guides.
  assert.match(pipeline.extras?.docs?.figma ?? '', /figma-to-wix/);
  assert.match(pipeline.extras?.docs?.canva ?? '', /canva-to-wix/);
});

test('selectors resolve manifest entries and throw on unknown ids', () => {
  assert.equal(initModuleDir(vespasianManifest), 'scripts/init');
  assert.equal(soleStep(vespasianManifest, 'wizard').command.exec, 'module');
  assert.throws(() => getScreen(vespasianManifest, 'nope'));
  assert.throws(() => getStep(getScreen(vespasianManifest, 'qa'), 'nope'));
});

test('prereq step treats exit 0 and 1 as success and names the prereq parser', () => {
  const step = soleStep(vespasianManifest, 'prereq');
  assert.deepEqual(step.successExitCodes, [0, 1]);
  assert.equal(step.parser, 'prereq');
});

test('project identity carries the Vespasian checkout markers and chooser copy', () => {
  assert.deepEqual(vespasianManifest.project.markers, [
    'bin/vespasian.mjs',
    'scripts/check-prerequisites.sh',
  ]);
  assert.equal(vespasianManifest.project.packageName, 'vespasian');
  assert.match(vespasianManifest.project.selectTitle, /Vespasian/);
});
