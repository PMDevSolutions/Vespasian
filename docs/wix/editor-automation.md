# Wix Editor Automation — session model, consent, flows, recovery

Vespasian drives the Wix **editor** with Playwright only for operations that have no official API
(see [API-COVERAGE.md](API-COVERAGE.md) for the exact routing). This document describes how that
plane works, its guardrails, and how it fails. The implementation lives in
`packages/wix-driver/src/editor/`; the agent-facing recipe is the
`.claude/skills/wix-playwright-driver/` skill.

## Be honest about what this is

Editor automation is a **Wix Terms-of-Use gray area**. ToU §2.2 restricts automated access to the
platform; automating *your own* account is unaddressed, which means an account flag is a real (if
unlikely) risk. Vespasian's posture:

- The plane is **off by default**. Nothing touches the editor until the user runs
  `vespasian login --editor` and acknowledges an explicit consent prompt that states the above.
- It runs on the **user's own account and credentials**, headed by default, at human pace
  (`WIX_EDITOR_SLOWMO_MS`, default 150 ms).
- Every operation that has an official API uses the API instead — always.
- **Never** CAPTCHA-solving services. Never credential sharing.
- It is also **operationally brittle**: Wix ships dozens of releases a day across 3+ coexisting
  editor generations; selectors are perishable. Everything below is designed around that fact.

## Session model

| Piece | Detail |
|---|---|
| Account | A dedicated **Wix-native email+password** login (not Google SSO), ideally used only by Vespasian |
| First login | `vespasian login --editor` → headed browser at manage.wix.com → the **human** solves reCAPTCHA/2FA once |
| Persistence | Playwright `storageState`, saved to `WIX_EDITOR_STORAGE_STATE` (default `.vespasian/session/state.json`, gitignored, `chmod 600`) |
| Reuse | Every later editor run loads the stored state — this suppresses most reCAPTCHA/2FA re-triggers |
| Headed vs headless | `WIX_EDITOR_HEADLESS=false` by default. Headless raises challenge risk; treat headless as experimental opt-in |
| Re-auth | None unattended — `WIX_EDITOR_TOTP_SECRET` is reserved but **not implemented in v0.1**; expiry always pauses for a human login (next row) |
| Expiry | **A designed human-in-the-loop pause, not an error.** The driver detects a logged-out state, stops, and asks you to re-run `vespasian login --editor` |

The session file is a live Wix login. Treat it like a password: it is inside the gitignored
`.vespasian/` directory and must never leave the machine.

## Entering the editor

Editor URLs are never templated by hand. The driver calls the **Get Editor URLs** API
(`GET /editor-urls/v2/editor-urls`) to obtain `editorUrl`, `previewUrl`, and — critically —
`editorType`. Vespasian asserts `editorType == WIX_STUDIO` and refuses classic Editor and Harmony
(ODEDITOR) sites: only Studio has custom CSS, breakpoints, and section grids
(see [ARCHITECTURE.md](ARCHITECTURE.md#product-decision-wix-studio-first)).

## Probe before flows

Editor internals are undocumented — including whether the canvas is an iframe. On first contact
with each editor version the driver runs a **DOM probe**:

1. Enumerate frames; detect whether the canvas is iframed (never assumed).
2. Dump visible `[data-hook]` attributes and aria labels for the panels it needs.
3. Cache a **versioned selector map** so later runs skip the probe until the editor version changes.

Selectors are treated as *hints, not contracts*. When a cached selector misses, the flow re-probes
before failing, then escalates (below).

## Deterministic flows vs agent-visual work

The scripted surface is deliberately small — only the **stable core** (~20% of editor
interactions):

| Deterministic flow | Notes |
|---|---|
| `openEditor` | via Get Editor URLs, session preloaded |
| Pages (create / rename / reorder / delete) | `/` opens the Pages panel, Alt+N adds a page (classic); context menus via data-hook/aria |
| Theme colors | Site Styles → Colors; exact HEX typed into pickers, every shade set explicitly |
| Theme typography | Site Styles → Typography; the 9 slots (H1–H6, P1–P3) |
| Font upload | the "Upload Fonts" dialog (WOFF2 preferred, < 4 MB) |
| Per-page SEO panel | title/meta description |
| Media picker | `frameLocator('#mediaGalleryFrame')`; verified data-hooks: `add-media-button`, `gallery-file`, `select-items` |
| Save | Ctrl/Cmd+S on classic (await the toast; handle the first-save free-domain dialog); Studio autosaves — no-op |
| Publish fallback | `[data-hook="topbar-publish"]` — only when the REST/CLI publish paths are unavailable |

Everything **compositional on the canvas** — adding sections, text, images, buttons, positioning
within section grids — is executed by the `wix-site-builder` agent through the **Playwright MCP**,
screenshot-grounded: it looks at the screen, acts, and verifies by re-reading the Layers/Pages tree
rather than trusting that a click landed. This is the remaining ~80% of the surface, and it is
agent-driven precisely because editor DOM selectors are perishable.

## Verification and recovery

- **Verify by observation, not by action**: after every step, confirm the effect (Layers tree,
  panel state, computed `--wst-*` variables on preview) before marking the BuildPlan step done.
- **On selector miss**: re-probe → retry once → escalate to the agent-visual path → if still
  failing, honor the step's `onFail` policy (`retry` | `escalate` | `skip-and-report`).
- **On CAPTCHA / 2FA / logged-out**: stop and escalate to the human. This is by design.
- **On editor crash or navigation loss**: the executor's checkpoints make the whole apply resumable
  (`vespasian apply --resume-from editor`).
- **Screenshot on failure**: every failed editor step attaches a screenshot to the run log for
  diagnosis (kept under `.vespasian/`, never committed).
- **Every fallback is recorded**: any step that fell back from API to editor automation, or from a
  deterministic flow to agent-visual driving, lands in the FidelityReport.

## Dry-run

`VESPASIAN_DRY_RUN=1` (or `vespasian apply --dry-run`) makes the editor driver emit its step list
and selector expectations **without launching a browser**. CI never opens the Wix editor.

## Doc grounding

Wix's developer docs are LLM-friendly: append `.md` to any docs URL, index at
[dev.wix.com/docs/llms.txt](https://dev.wix.com/docs/llms.txt). The agent layer uses this (plus the
optional official Wix MCP's doc-search tools) to re-verify endpoints and behaviors at runtime
rather than baking in assumptions that drift.
