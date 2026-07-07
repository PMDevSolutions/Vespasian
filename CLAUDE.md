# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **Vespasian** — a Claude Code-integrated **Wix site builder**: design in (Figma · Canva · InDesign), live Wix site out. It is a fork of Flavian (the WordPress-targeting sibling) that keeps the design-ingestion front end (parsers → IR → design tokens with provenance) and replaces everything downstream: instead of generating theme files, Vespasian compiles a **BuildPlan** and applies it to a real **Wix Studio** site through official Wix REST APIs first, the Wix CLI/Git integration for code, and Playwright-driven editor automation only where no API exists.

The pinned architecture is **`docs/wix/ARCHITECTURE.md`** — read it before touching the output layer. The per-operation API-vs-browser matrix is **`docs/wix/API-COVERAGE.md`**.

```
design in (Figma / Canva / InDesign)
   → parse → IR + content model            (packages/pipeline)
   → map   → design tokens + provenance    (packages/pipeline)
   → translate → ThemePlan + global.css    (packages/wix-driver/src/translate)
   → plan  → BuildPlan (ordered steps)     (packages/wix-driver/src/plan)
   → execute → live Wix site               (packages/wix-driver/src/executor → rest | cli | editor)
   → QA    → screenshots + FidelityReport  (packages/wix-driver/src/qa + visual-qa agent)
```

## ⚠️ CRITICAL: File Location Requirements

**There is no WordPress here. No `wp-content/`, no `themes/`, no `plugins/` directories — ever.**

```
project-root/
├── packages/
│   ├── pipeline/    ← design ingestion: parsers, IR, token mapper
│   ├── wix-driver/  ← the Wix output layer: auth, rest, cli, editor, translate, plan, executor, qa, dryrun
│   └── gui/         ← desktop GUI (@vespasian/gui)
├── bin/vespasian.mjs ← the CLI
├── scripts/         ← automation scripts
├── docs/            ← documentation
├── tests/           ← node --test + bats suites
├── .vespasian/      ← STATE (gitignored): session, plans, checkpoints, dry-run logs
└── .claude/         ← Claude Code configuration
```

**Rules:**
- **The build output is a live Wix site, not local files.** Nothing you generate is "installed" locally; `vespasian apply` pushes it to Wix.
- **Pipeline artifacts go under `.vespasian/`** — build plans in `.vespasian/plans/`, executor checkpoints in `.vespasian/checkpoints/`, the editor session at `.vespasian/session/state.json`, dry-run recordings alongside. The whole directory is gitignored; never commit it and never write artifacts elsewhere.
- **Never create `wp-content/`, `themes/`, or `plugins/` directories.** `scripts/shared/validate-output-location.sh` and the `validate-output-location.sh` hook enforce output structure.
- **Credentials live only in `.env`** (gitignored; `.env.example` ships placeholders only).

## Two Auth Planes

Vespasian talks to Wix through two independent auth planes that never substitute for each other (full detail: `docs/wix/ARCHITECTURE.md` and `docs/wix/editor-automation.md`):

| Plane | Used for | Mechanism |
|---|---|---|
| **API** (primary) | site create/list, media upload, CMS data, embeds, properties, publish | Account-level **API key**, sent as `Authorization: <key>` + exactly one of `wix-account-id` / `wix-site-id` |
| **Editor** (fallback) | pages, sections/elements, theme panels, per-page SEO, font upload | Real browser session: one-time **headed** login via `vespasian login --editor` (human solves CAPTCHA/2FA), persisted as Playwright `storageState` |

Editor automation is a Wix ToU gray area and is **off until the user consents** via `vespasian login --editor`. It runs headed by default, at human pace, on the user's own account. Never use CAPTCHA-solving services. Session expiry is a designed human-in-the-loop pause, not an error.

### Environment variables (all from `.env`, gitignored)

```
WIX_API_KEY                # account-level API key (required)
WIX_ACCOUNT_ID             # account GUID (required)
WIX_SITE_ID                # default target site GUID (optional; written by `vespasian site create|use`)
WIX_METASITE_ID            # cached metaSiteId for dashboard/editor URLs (optional)

WIX_EDITOR_STORAGE_STATE   # session path (default .vespasian/session/state.json)
WIX_EDITOR_HEADLESS        # 'false' by default — headed is the conservative choice
WIX_EDITOR_TOTP_SECRET     # reserved — TOTP re-auth not implemented in v0.1 (expiry pauses for a human login)
WIX_EDITOR_SLOWMO_MS       # human-plausible pacing (default 150)

WIX_SITE_URL               # published-site URL for QA/visual/Lighthouse scripts (CI: repo variable)

VESPASIAN_DRY_RUN          # '1' turns both planes into no-op recording transports (CI mode)
```

**All operations must honor `VESPASIAN_DRY_RUN=1`. No test may make real network calls.**

## Development Commands

### Setup

```bash
pnpm install                                    # workspace deps (pnpm 9.x, Node ≥ 20)
pnpm run init                                   # interactive setup wizard: writes .env
node bin/vespasian.mjs --help                   # the `vespasian` CLI entry point
```

### The `vespasian` CLI surface

```bash
vespasian init                                          # setup wizard
vespasian login --editor                                # consent + headed editor session capture
vespasian site create|use|list                          # provision / select the target Studio site
vespasian pipeline indesign <input> [--plan <out>]      # InDesign → BuildPlan (figma/canva are Claude-Code-driven)
vespasian plan <ir>                                     # compile a BuildPlan from a pipeline IR
vespasian apply <plan> [--dry-run|--resume-from <phase>] # execute a BuildPlan against the site
vespasian publish                                       # publish the site (REST; `wix publish` when code shipped)
vespasian qa                                            # published-site screenshots (+ --expect theme-var checks)
```

### Tests

```bash
pnpm test:pipeline                  # packages/pipeline (node --test)
pnpm test:init                      # setup wizard tests (node --test)
node --test tests/**/*.test.mjs     # any JS suite directly
git submodule update --init         # once: fetch the vendored bats libraries
./tests/libs/bats-core/bin/bats tests/unit/   # shell tests
```

Conventions: `node --test` (`*.test.mjs`) for JS, bats for shell. Never leave a test failing. No real network calls in any test — dry-run transports only.

### Script table

| Script | Purpose |
|---|---|
| `scripts/check-prerequisites.sh` | Verify Node, pnpm, Git, Claude Code, Wix credentials |
| `scripts/wix-environment-manager/check-environment.sh` | Env vars, API reachability, editor session freshness |
| `scripts/validate-site.sh` | Validate a compiled BuildPlan / site structure |
| `scripts/validate-site-e2e.sh [plan]` | Validate an existing compiled plan (lint + dry-run) plus optional live checks; the CI gate is `pnpm test:canva-e2e` |
| `scripts/shared/plan-lint.sh <plan.json>` | The runnable BuildPlan JSON shape linter |
| `scripts/wix-structure-validator/validate-structure.sh` | BuildPlan shape check as a PostToolUse-style hook (delegates to plan-lint.sh) |
| `scripts/design-token-auditor/` | Audit token usage in translate output (no literal hex) |
| `scripts/shared/validate-output-location.sh` | Enforce artifact locations (`.vespasian/`, `packages/`) |
| `scripts/wix-deployment/publish.sh` | Publish via Site Actions |
| `scripts/wix-deployment/pre-publish-checks.sh` | Pre-publish validation gate |
| `scripts/wix-deployment/rollback.sh` | Rollback guidance (Wix revert is unsupported → documented) |
| `scripts/figma-wix/` · `scripts/canva-wix/` · `scripts/indesign-wix/` | Per-pipeline helpers |
| `scripts/assets/optimize-images.sh` | Web-optimize images before media upload |
| `scripts/security-audit/scan-dependencies.sh` | npm dependency CVE scan |
| `scripts/visual-diff.js` · `scripts/check-responsive.sh` · `scripts/check-dark-mode.sh` | Visual QA |
| `scripts/validate-agent-configs.sh` | Validate all `.claude/` configs |
| `scripts/check-mcp.sh` · `scripts/setup-playwright.sh` | MCP + Playwright setup checks |

## Design-to-Wix Pipelines

**1. Figma-to-Wix** (Claude-Code-driven)
```
User: "Convert this Figma design to Wix"  [Figma URL]
Claude: extract tokens via Figma MCP → translate → BuildPlan → apply → publish → QA
Result: a live Wix Studio site + FidelityReport
```
Documentation: `docs/figma-to-wix/README.md`

**2. Canva-to-Wix** (Claude-Code-driven)
```
User: "Convert this Canva export to Wix"  [export directory path]
Claude: parse CSS tokens + HTML structure → translate → BuildPlan → apply → publish → QA
```
Documentation: `docs/canva-to-wix/README.md`

**3. InDesign-to-Wix** (CLI-driven)
```bash
node bin/vespasian.mjs pipeline indesign <input.idml|pdf> --plan .vespasian/plans/<slug>.json
node bin/vespasian.mjs apply .vespasian/plans/<slug>.json
pnpm pipeline:ingest            # ingest stage only (packages/pipeline)
pnpm pipeline:stage-assets      # asset-staging stage only
```
Documentation: `docs/pipelines/indesign.md`

### Operation channels (summary — full matrix in `docs/wix/API-COVERAGE.md`)

- **API**: sites, media (+file-ready polling), CMS collections/items, custom embeds, site properties, robots/llms.txt, publish
- **CLI**: `src/styles/global.css` (spacing tokens, typography overflow), Velo code — only *after* pages exist in the editor
- **Playwright** (deterministic flows): pages, theme colors, text theme, font upload, per-page SEO, save
- **Agent-visual**: canvas composition (sections/elements) via the `wix-site-builder` agent — screenshot-grounded, selectors are hints not contracts
- Executor phase order: provision → media → data → editor → code → properties/embeds → publish → QA (checkpointed; `--resume-from`)

## Vespasian + Claude Code Best Practices

- ✅ Prefer official APIs over editor automation for every operation that has one
- ✅ Honor `VESPASIAN_DRY_RUN=1` in every new transport or script
- ✅ Upload media via API *before* referencing it in the editor (media-first architecture)
- ✅ Keep all styling token-driven: theme slots + `--vsp-*` custom properties, never literal hex in translate output
- ✅ Record every fidelity loss in the FidelityReport instead of silently degrading
- ✅ Back off 60s on HTTP 429 (Wix rate limits are unpublished); handle revision conflicts on 409
- ✅ Never commit `.env` or `.vespasian/`; never log API keys or session cookies
- ✅ Escalate to the user on CAPTCHA/2FA — never automate around consent
- ✅ Use structured git commits with `/commit` (Conventional Commits; release-please)
- ✅ No new runtime dependencies — the REST client is plain `fetch`; prefer existing deps (zod, playwright, pixelmatch, pngjs, fflate, fast-xml-parser)

---

## Claude Code Architecture & Configuration

### Installed Plugins

Lean plugin configuration serving Node/Wix development:
- **episodic-memory** — conversation search and memory
- **commit-commands** — git workflow automation
- **github** — GitHub integration (PRs, issues, repos)
- **superpowers** — advanced development workflows
- **ai-taskmaster** — task management (local)

**Full documentation:** `.claude/PLUGINS-REFERENCE.md`

### Custom Agents (54 Total)

54 specialized agents spanning Wix-focused development and generic cross-domain work. Key Wix agents: `wix-site-builder` (executes BuildPlans — API ops via packages/wix-driver, editor ops by driving the Wix editor through the Playwright MCP, escalating to the user on CAPTCHA/2FA), `figma-wix-converter`, `canva-wix-converter`, `indesign-to-wix`, `wix-structure-validator`, `wix-token-auditor`, `wix-environment-manager`, `wix-stores-agent`, `wix-app-developer`, `wix-headless-developer`, `visual-qa-agent` (screenshots the live Wix site vs the source design), `deployment-agent`, `security-audit-agent`. Key generic agents: `agent-expert`, `backend-architect`, `migration-specialist`, `content-creator`, `devops-automator`.

Agents are invoked automatically based on task context.

**Full catalog:** `.claude/CUSTOM-AGENTS-GUIDE.md` · **Naming conflicts:** `.claude/AGENT-NAMING-GUIDE.md`

### Custom Skills (10 Total)

**Pipeline orchestrators:** figma-to-wix-autonomous-workflow, canva-to-wix-autonomous-workflow, indesign-conversion

**Site building:** wix-site-development, wix-media-first-architecture (upload media via API first, reference from editor — never hand-place unstaged assets), wix-playwright-driver (two auth planes, storageState session, consent gate, DOM probe before flows, deterministic panel flows vs agent-visual canvas work, recovery patterns)

**Quality:** visual-qa-verification (live Wix site vs design), vespasian-testing-workflows

**Operations:** vespasian-hook-integration, wix-cli-workflows (Wix CLI + REST recipes)

Skills auto-trigger based on keywords (e.g., "Wix", "BuildPlan", "publish", "visual QA").

**Full catalog:** `.claude/skills/README.md`

### Hooks

The authoritative wiring is `.claude/settings.json`. Wired there:

- **validate-output-location.sh** (PreToolUse, `.claude/hooks/`) — blocks writes outside the allowed output roots (`packages/`, `.vespasian/`)
- Six inline PostToolUse hooks:
  - **post-build-qa** — reminds to run the full quality gate (dry-run apply + `vespasian qa`) after a successful plan/apply/validate
  - **pre-commit-guard** — design-token guard: flags literal hex outside `--vsp-*` definitions in staged `global.css` before commits
  - **coverage-check** — reminds to review `node --test` coverage output
  - **dark-mode-reminder** — suggests `check-dark-mode.sh` after a passing visual diff
  - **bundle-guard** — plan-size sanity check: flags BuildPlans over 2048 KB (plans reference staged media, never embed bytes)
  - **mutation-test** — suggests StrykerJS mutation testing after a fully green test run

Invoked by the figma-to-wix workflow skill (hook scripts in `.claude/hooks/`, not wired in `settings.json`):

- **figma-wix-post-page.sh** — post-step QA reminder after a Figma-pipeline page is applied
- **figma-wix-completion.sh** — completion gate for the Figma pipeline

### Development Workflow with Claude Code

```bash
# Start feature branch
git checkout -b feat/palette-translation

# Develop; run the suites you touched
pnpm test:pipeline
pnpm --filter @vespasian/wix-driver test

# Rehearse against fixtures with zero credentials
VESPASIAN_DRY_RUN=1 node bin/vespasian.mjs apply .vespasian/plans/fixture.json --dry-run

# Commit with structure
/commit                # e.g. "feat(translate): map palette ramps to theme slots"
/commit-push-pr        # commit + push + PR
```

---

### Quick Command Reference

**Vespasian CLI & wizard:**
```bash
pnpm install                                     # workspace deps (pnpm 9.x)
pnpm run init                                    # setup wizard: writes .env
node bin/vespasian.mjs login --editor            # consent + editor session capture
node bin/vespasian.mjs site create|use|list      # target site management
node bin/vespasian.mjs plan <ir>                 # compile BuildPlan
node bin/vespasian.mjs apply <plan> --dry-run    # rehearse without credentials
node bin/vespasian.mjs publish                   # publish
node bin/vespasian.mjs qa                        # screenshots (+ --expect theme-var checks); FidelityReport comes from apply
```
Full guide: `docs/CLI-WIZARD.md`.

**Pipelines:**
```bash
node bin/vespasian.mjs pipeline indesign <input> --plan .vespasian/plans/<slug>.json
pnpm pipeline:ingest             # ingest stage (packages/pipeline)
pnpm pipeline:stage-assets       # asset-staging stage
# Figma / Canva conversions are driven through Claude Code — see docs/figma-to-wix/ and docs/canva-to-wix/
```

**Desktop GUI (`@vespasian/gui`):**
```bash
pnpm gui:dev                   # run the GUI from source
pnpm gui:build                 # build the renderer
pnpm gui:package               # build a distributable installer
```
Full guide: `docs/GUI.md`.

**Git workflows (via commit-commands):** `/commit` · `/commit-push-pr` · `/clean_gone`

**GitHub CLI:** `gh pr create` · `gh pr list` · `gh issue create` · `gh auth status`

**Quality & validation:**
```bash
./scripts/validate-site.sh [plan]                       # BuildPlan / structure validation
./scripts/validate-site-e2e.sh [plan]                   # validate an existing plan (+ optional live checks)
pnpm test:canva-e2e                                     # the CI site-validation gate: fixture compile + dry-run apply
./scripts/shared/plan-lint.sh <plan.json>               # BuildPlan JSON shape lint
./scripts/validate-agent-configs.sh                     # validate .claude/ configs
./scripts/security-audit/scan-dependencies.sh .         # npm dependency CVE scan
```

**Deployment / publish:**
```bash
./scripts/wix-deployment/pre-publish-checks.sh          # validation gate
./scripts/wix-deployment/publish.sh                     # publish via Site Actions
./scripts/wix-deployment/rollback.sh --acknowledge-manual # prints the manual Site History revert path (no rollback targets on Wix)
```

**Visual QA:**
```bash
node scripts/visual-diff.js [actual] [expected]  # pixel-level screenshot comparison
./scripts/check-responsive.sh [url]              # screenshots at the configured breakpoints (default 5 widths spanning the Studio ranges)
./scripts/check-dark-mode.sh [url]               # dark-mode visual verification
```

**Environment:**
```bash
./scripts/check-prerequisites.sh                        # tool checks
./scripts/wix-environment-manager/check-environment.sh  # env vars, API reachability, session freshness
./scripts/check-mcp.sh                                  # MCP server connectivity
```

---

**Last Updated:** 2026-07-06
**Architecture Status:** ✅ Wix Studio output layer (API-first, consent-gated editor automation, dry-run CI)
