# Test Runner

Run the Vespasian test suites: `node --test` for JavaScript, bats for shell.

## Purpose

Exercise the design pipeline and the Wix output layer without touching a real Wix site — every suite runs with `VESPASIAN_DRY_RUN=1` semantics and zero network calls.

## Usage

```
/test
```

## What this command does

1. **Runs workspace package tests** (`node --test` over `*.test.mjs`)
2. **Runs shell tests** with bats (`tests/unit/`, `tests/canva-wix/`, `tests/figma-wix/`)
3. **Reports coverage** when requested (`--experimental-test-coverage`)
4. **Never hits the network** — REST/editor transports are dry-run recorders in tests

## Example Commands

### Workspace packages (node --test)
```bash
# Everything
pnpm -r test

# One package
pnpm --filter @vespasian/pipeline test
pnpm --filter @vespasian/wix-driver test

# One file, verbose
node --test packages/wix-driver/tests/plan.test.mjs

# Filter by test name
node --test --test-name-pattern "compilePlan" packages/wix-driver/tests/

# With coverage
node --test --experimental-test-coverage packages/wix-driver/tests/
```

### Init wizard / CLI tests
```bash
node --test tests/init/
```

### Shell tests (bats)
```bash
# Once per checkout: fetch the vendored bats libraries
git submodule update --init

# All bats suites
./tests/libs/bats-core/bin/bats tests/unit tests/canva-wix tests/figma-wix

# Single suite
./tests/libs/bats-core/bin/bats tests/unit/site-structure.bats
```

### End-to-end dry run (no Wix account needed)
```bash
VESPASIAN_DRY_RUN=1 vespasian pipeline indesign tests/fixtures/minimal/ir.json --slug smoke
VESPASIAN_DRY_RUN=1 vespasian apply .vespasian/plans/smoke/plan.json --dry-run
```

## Best Practices

- Never leave a test failing: fix it, or if the feature was removed, remove the test and say so
- No real network calls in any test — use the dry-run transports and bundled fixtures
- Test names describe behavior ("compilePlan is deterministic for identical inputs")
- Keep tests isolated: fresh temp dirs per test, no shared mutable state
- Aim for 80%+ line coverage on `packages/pipeline` and `packages/wix-driver`
