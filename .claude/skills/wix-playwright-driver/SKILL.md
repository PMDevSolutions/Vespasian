---
name: wix-playwright-driver
description: Use when driving the Wix editor through Playwright or the Playwright MCP - session login and storageState lifecycle, the consent gate, DOM probing before flows, deterministic panel flows (pages, theme colors, typography, SEO, save, publish) vs agent-visual canvas composition, selector hints, and recovery/escalation patterns. Keywords: Wix editor automation, Playwright, storageState, data-hook, editor session, consent gate, canvas composition, editor fallback
---

# Wix Playwright Driver

## Overview

How Vespasian drives the **Wix editor** with Playwright — the fallback plane for the operations no API covers (pages, theme panels, canvas composition, font upload, per-page SEO). The scripted driver lives in `packages/wix-driver/src/editor/`; agent-visual work runs through the **Playwright MCP** guided by the `wix-site-builder` agent.

**Prime directive:** the editor plane is a *narrow, best-effort fallback*, not a load-bearing layer. Every operation with an official API uses the API (see `docs/wix/API-COVERAGE.md`). Wix ships dozens of releases a day across three-plus editor UIs — hardcoded selector scripts have a short half-life, so the architecture is: small deterministic core + probe + screenshot-grounded agent for everything else.

## ToS Honesty Box

> **Editor automation is a Wix Terms-of-Use gray area.** Wix ToU §2.2 prohibits page-scraping, mirroring, and creating a "browser or border environment" around Wix Services without prior written permission; automating *your own account's* editor is unaddressed — gray, not green. Practical consequences Vespasian accepts and mitigates:
>
> - The plane is **off by default** and only enabled after `vespasian login --editor` and an explicit consent prompt (the consent gate in `src/editor/consent.js`).
> - Automation runs on the **user's own account and credentials**, headed by default, at human pace (`WIX_EDITOR_SLOWMO_MS`, default 150).
> - **Never** captcha-solving services. reCAPTCHA/2FA/session expiry are designed human-in-the-loop pauses, not errors to defeat.
> - Wix may flag or block the account. Say so when a user enables the plane. For commercial distribution, written permission via the Wix partner/app program is the clean path.

## Two Auth Planes (never cross them)

| Plane | Used for | Mechanism |
|---|---|---|
| **API** (primary) | sites, media, CMS data, embeds, properties, publish | Account-level API key: `Authorization: <key>` + exactly one of `wix-account-id` / `wix-site-id` |
| **Editor** (fallback) | pages, sections/elements, theme panels, per-page SEO, font upload | Real browser session persisted as Playwright `storageState` |

API keys cannot open the editor; the editor session is never used for calls an API covers.

## Session Lifecycle (storageState)

**One-time interactive login (human present):**

```bash
vespasian login --editor
# → headed browser at manage.wix.com; the human solves reCAPTCHA/2FA;
# → consent prompt acknowledged;
# → context.storageState() saved to .vespasian/session/state.json (gitignored)
```

**Every subsequent run** reuses the saved state — this is the proven pattern (mid-2026 OSS precedent) and it also suppresses most reCAPTCHA/2FA re-triggers, which fire on *unrecognized devices*.

Session rules:
- **Wix-native email/password account** for the automation login, not Google SSO (SSO redirect flows are un-automatable and violate Google's own ToS). Prefer a dedicated login with access to only the target sites.
- Wix login is protected by **reCAPTCHA** (cannot be disabled) and optional **2FA** (Wix-app push > TOTP > SMS > email). `WIX_EDITOR_TOTP_SECRET` is reserved for future TOTP re-auth — **not implemented in v0.1**: session expiry always pauses for a human login (by design).
- **Headed by default** (`WIX_EDITOR_HEADLESS=false`). The known-working precedent runs headed with `--disable-blink-features=AutomationControlled` and a real Chrome UA; assume plain headless raises challenge risk.
- Session expiry ⇒ the driver pauses and asks the user to re-run `vespasian login --editor`. That is the designed recovery, not a failure.

Env vars: `WIX_EDITOR_STORAGE_STATE` (default `.vespasian/session/state.json`), `WIX_EDITOR_HEADLESS`, `WIX_EDITOR_TOTP_SECRET` (reserved — not implemented in v0.1), `WIX_EDITOR_SLOWMO_MS`. `VESPASIAN_DRY_RUN=1` emits the step list without launching any browser.

**Playwright MCP with the session:** launch the MCP against the same state so agent-visual work shares the login:

```json
"playwright": { "command": "npx", "args": ["@playwright/mcp@latest", "--storage-state", ".vespasian/session/state.json"] }
```

## Opening the Editor (never template URLs)

Always resolve the editor URL and flavor via the API:

```
GET https://www.wixapis.com/editor-urls/v2/editor-urls   (wix-site-id header)
→ { editorUrl, previewUrl, editorType }
   editorType ∈ { WIX_STUDIO, WIX_EDITOR, ODEDITOR (Harmony), WIXEL, EDITORLESS }
```

Branch strategy on `editorType`. Vespasian requires `WIX_STUDIO`; anything else fails fast (Classic has no custom CSS/breakpoints; Harmony is a separate, still-rolling-out UI). Observed URL shapes like `editor.wix.com/html/editor/web/renderer/edit/{siteGuid}?metaSiteId=...` are undocumented — resolve, don't construct. Editor bootstrap is slow: use 90–120s navigation timeouts.

## Probe Before Flows

The first action in any editor session (and after any Wix release breaks a flow) is a **DOM probe** (`src/editor/probe.js`):

1. Enumerate iframes — the media manager is an iframe (`#mediaGalleryFrame`); app panels and custom elements are iframes; **whether the canvas/stage itself is an iframe is not publicly documented** and must be probed per editor version.
2. Dump `[data-hook]` attributes on the top bar, left rail, and open panels.
3. Cache the resulting selector map per editor version; invalidate on mismatch.

`data-hook` is Wix's own internal test-selector convention (they run ~1.5M Puppeteer test runs/week against these UIs), which makes the editors unusually automatable — but the hooks are **hints, not contracts**: they change without notice.

## Deterministic Panel Flows (the small stable core)

Scripted flows (`src/editor/` `flows`) cover only stable, panel-shaped surfaces. Everything else is agent territory.

| Flow | Entry point | Notes |
|---|---|---|
| Pages: create/rename/reorder | Pages panel (`/` opens it in Classic; Studio pages panel) · `Alt+N` add page | Operate on list items via data-hook/aria selectors + context menus; verify by re-reading the pages list, not by trusting the click |
| Theme colors | Site Styles → Colors | Color pickers accept **typed hex** — focus the hex field and type; set every shade explicitly |
| Typography (text theme) | Site Styles → Text theme (H1–H6/P1–P3) | 9 slots only; overflow styles are `global.css` work, not editor work |
| Font upload | Text theme → upload dialog | WOFF2 < 4 MB; the one sanctioned editor upload |
| Per-page SEO | Page settings → SEO panel | No static-page SEO API exists |
| Save | `Ctrl/Cmd+S` (Classic) — await the save toast | **Studio autosaves**: a save step is a no-op there; handle first-save dialogs on brand-new sites |
| Publish | Publish button, top-right | No keyboard shortcut. Handle the success modal, and the code-validation dialog when the site has code. **Verify by fetching the public URL**, not by the modal. Prefer the Site Actions publish API — this flow is fallback-only |
| Media picker | `page.frameLocator('#mediaGalleryFrame')` | Select already-staged files only (see `wix-media-first-architecture`) |

Useful Classic-editor keyboard shortcuts (low-selector automation): `Ctrl+S` save, `Ctrl+P` preview, `/` pages panel, `Alt+N` add page, `Alt+B` add blank section, `Ctrl+J` mobile toggle, `Ctrl+Z/Y` undo/redo. Studio relies more on panels + autosave.

## Selector Hints (verified mid-2026 — treat as hints, re-probe before use)

| Surface | Selector |
|---|---|
| Publish (top bar) | `[data-hook="topbar-publish"]` |
| Modal close | `[data-hook="baseModalLayout-close-button"]` |
| Media manager iframe | `#mediaGalleryFrame` |
| Media: add files | `[data-hook="add-media-button"]` (inside the iframe) |
| Media: file tile | `[data-hook="gallery-file"]` |
| Media: confirm selection | `[data-hook="select-items"]` |
| Blog: new post (dashboard) | `[data-hook="blog-actions-bar__create-new-post"]` |
| Blog: title input | `[data-hook="post-form__title-input"]` |
| Rich text editor | `[data-hook="fullRicosEditor"]` |

Caveats: verified in the **dashboard/blog** context; the site editor shares components but must be probed. No mature OSS project automates the site editor canvas — Vespasian is pioneering there, with no community selector corpus to lean on.

## Agent-Visual Canvas Composition (the other ~80%)

Anything design-surface-shaped — Add Panel drag-drop, section composition, element positioning within grids, theme tweaks beyond typed inputs — is executed by the **wix-site-builder agent** driving the Playwright MCP visually:

- The agent works from **screenshots**, using data-hooks/aria labels as hints, and self-heals when selectors drift.
- Every insertion is **verified by observation** (re-screenshot, re-read the layers/pages tree), never by assuming the click worked.
- Plan steps with `method: "agent"` carry the section/blocks intent; the executor surfaces them to the agent and collects a structured result (`pending-agent` if the agent could not finish — not a silent failure).
- Drops onto the canvas may need coordinate math against a possibly-iframed stage — probe first.

**Budget rule:** deterministic scripts for login/open/save/publish/pages/theme-typed-inputs (~20% of the surface); agent-visual for the rest (~80%).

**Experimental channel:** on Harmony (`ODEDITOR`) sites, the "Ask Aria" natural-language box can execute edit instructions as text — one stable input instead of hundreds of selectors. Unproven; gate behind `editorType == ODEDITOR` and treat results with the same verify-by-observation discipline. Not used for Studio v1.

## Recovery & Escalation Ladder

```
1. Selector miss           → re-probe, try fallback selectors / keyboard entry point, retry (bounded)
2. Flow still failing      → screenshot-on-failure, demote the step to agent-visual execution
3. Agent cannot complete   → mark step pending-agent / onFail semantics (retry | escalate | skip-and-report)
4. CAPTCHA / 2FA / consent → ESCALATE to the user, always. Never automate around challenges.
5. Session expired         → pause; user re-runs `vespasian login --editor`; resume with
                             vespasian apply <plan> --resume-from editor
```

Always-on practices: bounded retries with human-paced waits, screenshot on every failure (attach to the report), never leave the editor mid-dialog (close modals before moving on), and prefer verifying state via API reads (pages via preview fetch, publish via public URL) over trusting editor UI feedback.

## Testing This Layer

- `packages/wix-driver/tests/consent.test.mjs` and the editor tests run **without a browser** (the module lazy-loads Playwright; dry-run emits step lists).
- Never point automated tests at real wix.com — session fixtures + dry-run only (`VESPASIAN_DRY_RUN=1`).
- Manual verification against a real site follows the live smoke test in `figma-to-wix-autonomous-workflow/TESTING-GUIDE.md`.

## Integration

- **Code:** `packages/wix-driver/src/editor/` (session, consent, probe, flows, escalation), `src/executor` (phase ordering, checkpoints)
- **Skills:** `wix-site-development` (what to change), `wix-media-first-architecture` (staged-media picker discipline), `visual-qa-verification` (post-apply verification)
- **Agents:** `wix-site-builder` (primary consumer), `visual-qa-agent`
- **Docs:** `docs/wix/ARCHITECTURE.md` (two planes, consent), `docs/wix/editor-automation.md`, `docs/wix/API-COVERAGE.md`

---

**Skill Version:** 1.0.0
**Last Updated:** 2026-07-06
