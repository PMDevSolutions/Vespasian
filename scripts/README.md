# Scripts

Hook scripts for Claude Code agents plus the standalone tooling that drives
Vespasian's build → apply → publish → QA loop. Hooks provide validation,
automation, and safety features that run automatically when agents are used;
the standalone scripts are also safe to run by hand.

## Overview

- **Shared validators** — output-location guard, BuildPlan lint, published-page verification
- **Pipeline hook dirs** — `figma-wix/`, `canva-wix/`, `indesign-wix/` (extraction, conversion, reporting)
- **Agent-specific hooks** — 2-3 scripts per agent, wired from `.claude/agents/*.md` frontmatter
- **Publish tooling** — `wix-deployment/` (pre-checks, publish, honest rollback, notifications)
- **Visual QA** — capture/diff/responsive/dark-mode/cross-browser against the published site
- **Automated reporting** — hooks save reports to `.claude/reports/`

## Shared Validators (`shared/`)

### Output-location guard (`shared/validate-output-location.sh`)
- **Type**: Blocking (exit 2), PreToolUse
- **Purpose**: blocks writes to WordPress-style paths (`themes/`, `plugins/`, `wp-content/`)
  — Vespasian artifacts belong in `.vespasian/` and `packages/`

### BuildPlan lint (`shared/plan-lint.sh`)
- **Type**: Standalone + used by hooks/CI
- **Purpose**: validates a BuildPlan JSON: `planVersion`, step fields,
  `method` ∈ api|cli|playwright|agent, canonical phase ordering, `meta.sourceHash`
- **Usage**: `./scripts/shared/plan-lint.sh .vespasian/plans/<plan>.json`

### Published-page verification (`shared/verify-published.sh`)
- **Type**: Standalone
- **Purpose**: curl-level smoke check of the published site (HTTP 200, no
  placeholder page, expected text)
- **Usage**: `./scripts/shared/verify-published.sh $WIX_SITE_URL --expect "Welcome"`

## Pipeline Hook Directories

### `figma-wix/`
| Script | Role |
|---|---|
| `extract-design-tokens.sh` | PostToolUse — validates `tokens.json` coverage (palette/fontSizes/spacingSizes) + Wix slot-limit notes |
| `optimize-tokens.sh` | Standalone — finds repeated hardcoded values in staged output, suggests token promotions |
| `batch-convert-templates.sh` | Progress/checkpoint tracking for multi-page conversion batches |
| `generate-comparison-report.sh` | Stop — writes `.claude/reports/figma-wix-comparison.md` (tokens, plan summary, fidelity notes) |
| `log-figma-access.sh` | PostToolUse — audit log of Figma MCP calls to `.claude/logs/figma-access.log` |

### `canva-wix/`
| Script | Role |
|---|---|
| `parse-canva-export.sh` | Extracts design tokens from Canva CSS (`--tokens`, `--colors`, `--fonts`, `--font-sizes`, `--spacing`) |
| `convert-html-to-wix.sh` | Converts Canva HTML into the neutral content-block JSON the plan compiler consumes |
| `generate-comparison-report.sh` | Stop — writes `.claude/reports/canva-wix-comparison.md` |

### `indesign-wix/`
| Script | Role |
|---|---|
| `smoke-test.mjs` | E2E smoke: fixture .idml → `vespasian pipeline indesign --plan` → BuildPlan validity |

## Validation Orchestrators

### `validate-site.sh`
- Runs all build checks in sequence: plan-lint → token coverage → token
  compliance of staged output → dry-run apply → published smoke check
- **Usage**: `./scripts/validate-site.sh [plan.json] [--strict] [--report]`

### `validate-site-e2e.sh`
- Adds the live stages: published-page verification, responsive screenshots,
  Lighthouse, cross-browser capture (needs `WIX_SITE_URL`)
- **Usage**: `./scripts/validate-site-e2e.sh [plan.json] [--url <url>] [--full]`

## Publish Tooling (`wix-deployment/`)

See `wix-deployment/README.md`. Highlights:

| Script | Purpose |
|---|---|
| `publish.sh` | Pre-checks → publish (CLI or Site Publisher REST) → verify → notify |
| `pre-publish-checks.sh` | Credentials, plan-lint, dry-run apply, QA freshness, CVE scan, secret hygiene |
| `rollback.sh` | **Wix has no revert API** — documents the manual Site History path (exits 1 without `--acknowledge-manual`) |
| `notify.sh` | Slack / Discord / webhook / email notifications |

`scripts/deploy.sh` is a thin wrapper around `wix-deployment/publish.sh`.

## Environment & Setup

| Script | Purpose |
|---|---|
| `check-prerequisites.sh` | Node 20+, pnpm 9, Claude Code, git; optional gh/jq/Wix CLI/Playwright; warns on missing WIX_* creds |
| `check-mcp.sh` | Figma (desktop + remote) and Playwright MCP reachability |
| `validate-env.sh` | WIX_* format checks (GUIDs, placeholder detection) — never prints secret values |
| `setup-playwright.sh` | Installs Playwright + chromium/firefox/webkit engines |
| `install-git-hooks.sh` | Pre-commit hook: secrets/state guard, syntax checks, plan-lint |

## Visual QA

| Script | Purpose |
|---|---|
| `visual-diff.js` | Pixel-level screenshot comparison (pixelmatch): single + `--batch` modes |
| `visual-capture.sh` | Captures `tests/visual/urls.json` matrix from `$WIX_SITE_URL` into `tests/visual/actual/` |
| `visual-update-baselines.sh` | Regenerates committed baselines (Playwright Docker image for CI-identical rendering) |
| `check-responsive.sh` | Screenshots at all breakpoints (`$WIX_SITE_URL` or arg) |
| `check-dark-mode.sh` | Dark-mode capture + diff vs light baselines |
| `cross-browser-test.sh` | chromium/firefox/webkit capture to `.claude/visual-qa/screenshots/wix/<browser>/` |

All visual scripts require a target URL — `WIX_SITE_URL` or an explicit
argument. There is no localhost default: the thing under test is the live site.

## Agent-Specific Hooks

Each agent has hooks that run at different lifecycle stages.

### wix-structure-validator
1. **PostToolUse** — `validate-structure.sh` — validates BuildPlans / content models / page payloads under `.vespasian/`

### design-token-auditor
1. **PostToolUse** — `audit-tokens.sh` — flags hardcoded colors/px in generated output (token definitions in `tokens.json`/`global.css` are exempt)

### wix-environment-manager
1. **SubagentStart** — `check-environment.sh` — WIX_* env presence/GUID shape, API ping (skips without creds/dry-run), editor-session freshness

### content-seeder
1. **Stop** — `verify-pages.sh` — expected pages from the content model/plan vs the published site (HTTP; skips without `WIX_SITE_URL`)

### test-writer-fixer
1. **PreToolUse** — `validate-test-command.sh` — blocks dangerous test commands
2. **PostToolUse** — `save-coverage.sh` — saves test coverage reports
3. **Stop** — `commit-coverage.sh` — creates coverage index

### performance-benchmarker
1. **SubagentStart** — `check-tools.sh` — verifies profiling tools available
2. **PostToolUse** — `save-benchmarks.sh` — archives benchmark results
3. **Stop** — `compare-results.sh` — generates comparison reports

### frontend-developer
1. **PostToolUse (Write/Edit)** — `lint-and-format.sh` — auto-lints and formats code
2. **PostToolUse (Bash)** — `check-build.sh` — verifies build passes
3. **Stop** — `build-report.sh` — generates build status report

### api-tester
1. **SubagentStart** — `check-endpoints.sh` — verifies API endpoints reachable (works on `www.wixapis.com` too)
2. **PostToolUse** — `save-results.sh` — archives API test results
3. **Stop** — `generate-summary.sh` — creates test summary

### docusaurus-expert
1. **PostToolUse (Write/Edit)** — `validate-markdown.sh` — validates markdown/MDX
2. **PostToolUse (Bash)** — `check-build.sh` — runs Docusaurus build
3. **Stop** — `preview-link.sh` — generates preview instructions

### analytics-reporter
1. **SubagentStart** — `check-data-sources.sh` — verifies database/API connections
2. **PostToolUse** — `format-report.sh` — formats analytics reports (JSON/CSV)
3. **Stop** — `archive-report.sh` — archives reports with timestamps

### test-results-analyzer
1. **SubagentStart** — `create-run-dir.sh` — creates timestamped run directory
2. **PostToolUse** — `validate-report.sh` — validates test report format
3. **Stop** — `archive-and-trend.sh` — archives results and generates trends

## Security Audit (`security-audit/`)

| Script | Purpose |
|---|---|
| `scan-dependencies.sh` | pnpm/npm CVE scan (workspace root + nested lockfiles), JSON output |
| `generate-report.sh` | stdin scan JSON → Markdown severity report in `.claude/security-reports/` |
| `create-issues.sh` | stdin scan JSON → deduplicated GitHub issues for critical/high CVEs |

## Config Validation

| Script | Purpose |
|---|---|
| `validate-agent-configs.sh` | Validates `.claude/` agents, skills, settings (frontmatter, hook paths, JSON) |
| `validate-agent-configs-ci.sh` | CI wrapper (non-zero exit on error) |

Every script rename/removal in `scripts/` must be mirrored in `.claude/`
frontmatter and `settings.json`, or `validate-agent-configs.sh` fails CI.

## Hook Exit Codes

- **Exit 0**: Success/Warning — operation proceeds, output shown as warnings
- **Exit 2**: Block — critical issue, operation prevented, error shown to agent
- **Other**: Script failure — treated as block

## Hook Types

- **PreToolUse** — before a tool runs (validation, safety)
- **PostToolUse** — after a tool completes (linting, saving results)
- **SubagentStart** — when an agent starts (environment checks)
- **Stop** — when an agent completes (reporting, archiving)

## Report Structure

All hooks save reports to `.claude/reports/{agent-name}/` (or a flat
`.claude/reports/*.md` for the comparison reports).

## Debugging Hooks

1. **Check hook output**: hooks write to stderr, visible in agent output
2. **Run manually**: `echo '{"tool_input":{"file_path":"..."}}' | ./scripts/{dir}/script.sh`
3. **Check permissions**: `chmod +x scripts/**/*.sh`
4. **Test exit codes**: `echo $?` after running

## Contributing

When adding new hooks:

1. Follow existing patterns
2. Use clear, actionable error messages
3. Exit 0 for warnings, exit 2 for blocks
4. Save reports to `.claude/reports/{agent-name}/`
5. Mirror any wiring change in `.claude/` (agents frontmatter / settings.json)
6. Update this README
