---
name: vespasian-testing-workflows
description: Use when writing or running tests for the Vespasian pipeline and Wix output layer - node --test suites, bats shell tests, dry-run end-to-end runs, fixture/record-replay patterns, coverage, and CI automation. Keywords: node --test, bats, unit tests, dry-run, fixtures, test coverage, CI, VESPASIAN_DRY_RUN
---

# Vespasian Testing Workflows

## Overview

How this repo tests: **`node --test`** (`*.test.mjs`) for JavaScript, **bats** for shell scripts, and a **dry-run end-to-end** path that exercises IR → translate → plan → execute with zero Wix credentials and zero network.

**Core principles:**
- **No real network calls in any test.** The REST and editor transports have dry-run recorders (`packages/wix-driver/src/dryrun/`); tests assert against recorded requests and bundled fixtures.
- **Never leave a test failing.** Fix it, or if the tested feature was removed, remove the test and say so.
- **TDD-first for pipeline code:** the plan compiler is deterministic (same inputs → byte-identical output), which makes snapshot-style assertions cheap and reliable.

## When to Use

- Writing tests for `packages/pipeline`, `packages/wix-driver`, `bin/vespasian.mjs`, or shell scripts
- Setting up or debugging CI test runs
- Adding fixtures for new API families or plan step types
- "write tests" · "run the tests" · "test coverage" · "why is CI red"

## Test Map

| Suite | Runner | Location | What it covers |
|---|---|---|---|
| Pipeline unit | `node --test` | `packages/pipeline/tests/` | IDML/PDF parsing, token mapping, asset staging |
| Wix-driver unit | `node --test` | `packages/wix-driver/tests/` | translate, plan compile, executor, REST families, consent, transports |
| Init wizard / CLI | `node --test` | `tests/init/` | `vespasian init` flows, arg parsing |
| Shell scripts | bats | `tests/unit/`, `tests/figma-wix/`, `tests/canva-wix/` | hooks, validators, conversion helpers (e.g. `site-structure.bats` validates BuildPlan JSON shape) |
| Visual/QA | scripted | `tests/visual/` | screenshot/diff plumbing; `seed.sh` no-ops unless `WIX_SITE_ID` is set |

## Running Tests

```bash
pnpm -r test                                  # all workspace packages
pnpm --filter @vespasian/pipeline test        # one package
pnpm --filter @vespasian/wix-driver test

node --test packages/wix-driver/tests/plan.test.mjs        # one file
node --test --test-name-pattern "deterministic" packages/wix-driver/tests/

node --test --experimental-test-coverage packages/wix-driver/tests/   # coverage

git submodule update --init                                # once: vendored bats libraries
./tests/libs/bats-core/bin/bats tests/unit tests/figma-wix tests/canva-wix   # shell suites
```

## Writing node --test Suites

```js
// packages/wix-driver/tests/example.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compilePlan } from '../src/plan/index.js';

test('compilePlan is deterministic for identical inputs', () => {
  const inputs = loadFixtureArtifacts();          // plain parsed JSON, no network
  const a = compilePlan(inputs);
  const b = compilePlan(inputs);
  assert.deepEqual(a, b);
});

test('media steps precede editor steps', () => {
  const plan = compilePlan(loadFixtureArtifacts());
  const phases = plan.steps.map((s) => s.phase);
  assert.ok(phases.lastIndexOf('media') < phases.indexOf('editor'));
});
```

Conventions:
- Behavior-describing names, `assert/strict`, one concern per test
- Fresh `fs.mkdtemp` temp dirs per test that touches disk; clean up in `t.after`
- Import-safety matters: `src/editor` must stay importable without a browser — test that, don't break it

## The Dry-Run Transport (record/replay)

`VESPASIAN_DRY_RUN=1` (or `{ dryRun: true }`) swaps both planes for recorders:

- **REST:** intended requests logged (secrets redacted) against canned fixture responses; optional JSONL under `.vespasian/dryrun/`
- **CLI:** `global.css`/Velo writes go to a local staging directory
- **Editor:** step list emitted, no browser launched

Test pattern:

```js
import { createDryRunClient } from '@vespasian/wix-driver';

test('publish step issues exactly one site-actions call', async () => {
  const client = createDryRunClient();
  await executePlan(plan, { rest: client });
  const calls = client.requestLog.filter((r) => r.family === 'siteActions');
  assert.equal(calls.length, 1);
});
```

Adding a fixture for a new API family: put the canned response in `src/dryrun/fixtures.js` (or the tests' `fixtures/` dir), shaped like the real API's response envelope — copy the shape from `docs/wix/API-COVERAGE.md`, never from memory.

## Writing bats Tests

```bash
# tests/unit/site-structure.bats
@test "example BuildPlan validates" {
  run bash .claude/hooks/figma-wix-post-page.sh .claude/templates/pipeline/example-buildplan.json
  [ "$status" -eq 0 ]
}

@test "output-location hook blocks themes/ writes" {
  run bash -c 'echo "{\"tool_input\":{\"file_path\":\"themes/x/a.css\"}}" | bash .claude/hooks/validate-output-location.sh'
  [ "$status" -eq 2 ]
}
```

Use `tests/test_helper.bash` for shared setup; keep each test independent of execution order.

## End-to-End (dry-run) — the PR gate

```bash
VESPASIAN_DRY_RUN=1 vespasian pipeline indesign <fixture.idml> --plan .vespasian/plans/e2e
VESPASIAN_DRY_RUN=1 vespasian apply .vespasian/plans/e2e/plan.json --dry-run
```

CI (`site-validation.yml`) compiles a BuildPlan from fixtures and dry-run applies it on every PR. The live smoke test (real site, real publish) is manual-only — see `figma-to-wix-autonomous-workflow/TESTING-GUIDE.md`.

## Coverage & Mutation Testing

- Target: **80%+ line coverage** on `packages/pipeline` and `packages/wix-driver` (`--experimental-test-coverage`); the coverage-check hook reminds you after coverage runs.
- Optional test-quality check: **StrykerJS** mutation testing (`npx stryker run`) — suggested by the mutation-test hook after green runs; not installed by default.

## Common Mistakes

1. **Testing against real wixapis.com** — never; dry-run transports only. A test needing credentials is a design bug.
2. **Asserting on log strings** — assert on the request log/plan structures, not console output.
3. **Fixtures drifted from real API shapes** — when Wix changes a response envelope, update the fixture AND note it in API-COVERAGE.md.
4. **Order-dependent bats tests** — each `@test` must set up its own world.
5. **Deleting a failing test to go green** — only remove tests whose feature was removed, and say so in the PR.

## Integration

- **Agents:** `test-writer-fixer` (owns suite health), `test-results-analyzer`
- **Hooks:** coverage-check, mutation-test (inline in `.claude/settings.json`)
- **Skills:** `vespasian-hook-integration` (testing hooks), `visual-qa-verification` (the non-unit half of QA)

---

**Skill Version:** 2.0.0 (replaces wordpress-testing-workflows)
**Last Updated:** 2026-07-06
