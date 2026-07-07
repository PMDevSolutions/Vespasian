# Vespasian Desktop GUI

A cross-platform desktop app that wraps Vespasian's existing CLI workflows — the setup
wizard, the Wix site lifecycle (connect, apply, publish), the Figma/Canva/InDesign conversion
pipelines, and the visual-QA workflow — so a designer or less-technical user can go from
"design in" to "live Wix site out" without touching a terminal (with one honest exception:
the consent-gated editor login, which is interactive by design).

The GUI is a **thin orchestration layer**: it invokes the repo's existing scripts and
pipelines (`scripts/init/`, `bin/vespasian.mjs`, the visual-QA pnpm scripts) and Claude Code
— it does **not** reimplement any pipeline logic. The command surface it wraps is the CLI
contract (`bin/vespasian.mjs` — see [CLI-WIZARD.md](CLI-WIZARD.md)).

## Stack

- **Electron + TypeScript + React**, built with [electron-vite](https://electron-vite.org/)
  and packaged with electron-builder.
- Lives as a workspace package at `packages/gui/` (`@vespasian/gui`).
- The Electron **main process is Node.js**, so it imports the repo's existing Node modules
  directly (e.g. `scripts/init/apply.mjs`) and shares one code path with the CLI.

## Architecture

A hard layering boundary keeps the orchestration logic testable without launching Electron:

| Layer | Path | Rule |
| --- | --- | --- |
| Shared | `src/shared/` | Types + IPC channel constants + the pure-data ProductManifest; imported by both sides. |
| Core | `src/core/` | **Pure Node/TS, no `electron` import.** Process spawning, the shell resolver, the task model, output parsing, `.env`/plan discovery. 100% unit-tested. |
| Main | `src/main/` | Electron main; imports core, bridges core events ⇄ IPC, owns the window. |
| Preload | `src/preload/` | `contextBridge` only — exposes the typed `window.vespasian` bridge. |
| Renderer | `src/renderer/` | React; talks only to `window.vespasian`. |

The renderer can only invoke named, typed operations on the bridge — never an arbitrary
command. Each future feature adds one typed method + an `ipcMain` handler; the generic
task-streaming channel (`onTaskEvent` / `getTaskSnapshot` / `cancelTask`) works for all of
them. Everything product-specific (project markers, screens, step commands, links, docs
paths) lives in one declarative manifest — `src/shared/product/vespasian.ts`; see
`packages/gui/docs/GUI-PLATFORM.md` for the platform plan.

### Process layer

`ProcessRunner` spawns a command (`child_process`, no `shell:true`), streams stdout/stderr
as structured events, reports the exit code, and is cancellable. A cross-platform
**shell resolver** finds a POSIX `bash` (Git Bash on Windows, excluding the WSL
`System32\bash.exe`) to run the repo's `.sh` scripts; `node`/`pnpm`/`claude` are
invoked directly. A `PtyRunner` stub reserves the seam for node-pty (needed later for
interactive flows like `vespasian login --editor` and live `claude` sessions).

## Screens

| Screen | What it does | Wraps |
| --- | --- | --- |
| **Prerequisites** | Runs the prereq check and shows a pass/fail/warn checklist with actionable guidance (Git, Node 20+, pnpm 9, Claude Code, optional Wix CLI/Playwright, Wix credentials in `.env`). Warnings — e.g. missing credentials — are shown but never block. | `scripts/check-prerequisites.sh` |
| **Setup wizard** | Collects slug, title, optional Wix API key + account id, and the target-site choice (skip / create a Studio site / connect an existing id), writes `.env`, provisions or connects the site, and verifies the result. Inputs are validated via `resolveDefaults` before anything runs. | `scripts/init/` `resolveDefaults()` + `apply()` (in-process) |
| **Wix site** | Shows the connection state read from `.env` + `.vespasian/` (API key/account set? target site? editor session captured? dry-run?), lists the account's sites, connects a site id (writes `WIX_SITE_ID`), applies a compiled BuildPlan picked from `.vespasian/plans/`, and publishes. Failed runs get actionable hints (401/403 key problems, 429 backoff, session expiry) linking to [TROUBLESHOOTING.md](TROUBLESHOOTING.md). Editor login is intentionally a terminal step (see below). | `vespasian site list\|use` / `vespasian apply` / `vespasian publish` |
| **Convert design** | Pick Figma / Canva / InDesign, provide the input (Figma URL with validation + Dev Mode note; native folder picker for Canva; native `.idml`/PDF picker for InDesign), launch, and stream progress. Figma/Canva run as autonomous headless Claude Code workflows (compile plan → apply → QA); InDesign runs the deterministic CLI and, on success, points at the compiled plan to apply from the **Wix site** tab. Failures link to the troubleshooting docs. | `claude -p` (Figma/Canva) / `vespasian pipeline indesign` |
| **Visual QA** | Runs visual regression and Lighthouse against the published Wix site, then renders the artifacts: pixel-diff triptychs, design-vs-live-site side-by-sides (`.claude/visual-qa/screenshots/{figma,wix/chromium}`), the QA agent report, and every apply's **FidelityReport** (`.vespasian/plans/<slug>/fidelity-report.md`). | `pnpm visual:diff` / `pnpm lighthouse:run` |

The **Setup wizard** mirrors `pnpm run init` — the same inputs and flags documented in
**[CLI-WIZARD.md](CLI-WIZARD.md)** — and runs the wizard's `apply()` / `resolveDefaults()`
in-process (one shared code path, no duplicated setup logic) rather than spawning the CLI.
Each step (`.env` written, site provisioned/connected, verify) streams into the log with
success/error states.

**Editor login stays in the terminal.** `vespasian login --editor` is a consent gate plus a
headed, human-completed login (possibly CAPTCHA/2FA) — it requires an interactive TTY, so
the Wix site screen shows whether a session is captured and tells you to run
`pnpm vespasian login --editor` yourself instead of pretending to automate it.

## Commands

From the repo root:

```bash
pnpm gui:dev         # launch the app in development (Vite HMR)
pnpm gui:build       # build main/preload/renderer bundles
pnpm gui:test        # run the core unit tests (headless, no Electron window)
pnpm gui:lint        # ESLint (flat config: TypeScript + React)
pnpm gui:typecheck   # type-check main + renderer
pnpm gui:package     # build + produce an installer via electron-builder
```

Or from `packages/gui/`: `pnpm dev` / `pnpm build` / `pnpm test` / `pnpm typecheck`.

## Tests

The orchestration core is covered by `node --test` (via `tsx`) under
`packages/gui/tests/` — process runner, shell resolver, prerequisite parser (against
fixtures of the real script output), prerequisite orchestration, pipeline-run command
building, init-flag mapping, Wix site status (`.env` parsing, session detection),
plan/FidelityReport discovery, sandboxed artifact reads, project-root detection, and the
manifest shape. CI (`.github/workflows/gui.yml`) runs **lint → typecheck → tests**, all
headless — no window is launched. Linting is ESLint 9 flat config
(`eslint.config.mjs`): typescript-eslint for all `.ts`/`.tsx`/`.mts`, plus
React + React-Hooks rules for the renderer. Type-checking stays in `tsc`.

## Packaging & distribution

```bash
pnpm gui:package   # electron-vite build && electron-builder
```

Config: `packages/gui/electron-builder.yml` (targets: NSIS on Windows, DMG on macOS,
AppImage on Linux; output to `packages/gui/dist/`). Windows produces
`dist/Vespasian Setup <version>.exe` (installer) plus a runnable `dist/win-unpacked/`.

Builds are **unsigned** (`signAndEditExecutable: false`) so `gui:package` works on a stock
Windows without elevated privileges. electron-builder's code-signing toolchain
(`winCodeSign`) ships macOS symlinks that Windows can't extract without Developer Mode or
an elevated shell, so it 404s the build — disabling signing sidesteps it entirely. For a
**signed release**, supply a certificate (`CSC_LINK` / `CSC_KEY_PASSWORD`), remove
`signAndEditExecutable: false`, and build on a host with signing privileges.

**Versioning & release artifacts.** The GUI version is written by release-please
(`packages/gui/package.json` is an `extra-files` entry in `release-please-config.json`), so
it tracks the repo's git-tag-driven version and is **never hand-bumped**. When release-please
publishes a GitHub Release, the **GUI Release Build** workflow
(`.github/workflows/gui-release.yml`) builds the macOS / Windows / Linux installers,
smoke-tests each, and attaches them to the release. A packaged-launch smoke test also runs on
every GUI PR (`.github/workflows/gui.yml`, via Xvfb).

The GUI **operates on a Vespasian project directory on disk** — it writes `.env`, compiled
plans (`.vespasian/plans/`), and QA artifacts there, so those files must stay writable. The
app bundle therefore ships only the GUI itself and does **not** embed the project or its
scripts. At startup it locates the project by walking up from where it runs (launching from
inside a checkout "just works"); the **Open project folder…** action (sidebar "Choose
project…" / "Change…") lets you point it at any checkout, and the choice is remembered
between launches.

The distribution model: a user installs the app and runs it against a Vespasian project on
disk, driving setup → Wix site → conversion → QA through the UI.

## First run & walkthrough

1. **Install & launch** — run the installer for your OS (or `pnpm gui:dev` from a checkout).
2. **Open a project** — on first launch, click **Choose folder…** and pick your Vespasian
   checkout (the folder with `bin/vespasian.mjs`). It's remembered next time.
3. **Prerequisites** — confirm Git, Node, pnpm, and Claude Code are detected, and see
   whether your Wix credentials are configured; fix anything flagged.
4. **Setup wizard** — write `.env` and create/connect the target Studio site — the same
   `apply()`/`resolveDefaults()` as `pnpm run init`.
5. **Wix site** — check the connection state; optionally capture the editor session in a
   terminal (`pnpm vespasian login --editor`, consent + headed login).
6. **Convert design** — pick Figma / Canva / InDesign, provide the input, launch, and watch
   the streamed progress; for InDesign, then **Apply** the compiled plan and **Publish**
   from the Wix site tab.
7. **Visual QA** — run QA and review the pixel diffs, the design-vs-live comparison, and
   the FidelityReport.

## Requirements

Running the GUI requires the same tools Vespasian itself needs — Git, Node 20+, pnpm 9,
Claude Code, and (for live runs) Wix credentials in `.env` — which is exactly what the
**Prerequisites** screen detects (by running `scripts/check-prerequisites.sh` and rendering
the result with actionable guidance). Everything works credential-free under
`VESPASIAN_DRY_RUN=1`. On Windows the GUI needs Git Bash available to run the repo's
`.sh` scripts.

### GUI-only environment variables (development)

Two `VESPASIAN_*` variables exist only for developing/debugging the GUI itself — they are
not part of the runtime env contract and do not belong in a project `.env`:

| Variable | Effect |
|---|---|
| `VESPASIAN_BASH` | Absolute path to a bash binary; overrides the GUI's shell auto-detection (escape hatch on Windows, injection point in tests). |
| `VESPASIAN_DEBUG` | Any non-empty value enables the GUI core's `debug`-level console logging. |
