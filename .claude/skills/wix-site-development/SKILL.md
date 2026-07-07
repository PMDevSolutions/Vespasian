---
name: wix-site-development
description: Use when building or restructuring Wix Studio sites - pages, sections, grids, responsive breakpoints, site styles (color roles, text theme), custom CSS via global.css, and choosing the right operation channel (API vs CLI vs editor). Keywords: Wix Studio, sections, grids, breakpoints, site styles, text theme, global.css, Wix site structure, responsive Wix
---

# Wix Site Development (Studio)

## Overview

Core knowledge for working on **Wix Studio** sites — the concepts every Vespasian pipeline step and manual edit builds on: how a Studio site is structured (pages → sections → grid cells → elements), how styling flows (site styles + `global.css`), how responsiveness works (real breakpoints), and which operation channel each change must use.

**Vespasian targets Wix Studio exclusively (v1):**
- Studio is the only Wix editor flavor with **custom CSS** (`global.css` via the Git integration) — the only fully headless styling channel.
- Studio has real **responsive breakpoints** and section grids — the only sane target for a layout IR.
- Classic Editor (no custom CSS, no breakpoints, absolute layout) is unsupported; the provisioner asserts `editorType == WIX_STUDIO` after creating a site and fails fast otherwise.

## When to Use

Use this skill when:
- Creating or restructuring pages and sections on a Studio site
- Deciding which channel (API / CLI / editor) an operation belongs to
- Applying a design system: theme colors, text theme, spacing, fonts
- Debugging responsive behavior across Studio breakpoints
- Writing or reviewing `global.css`

**Trigger phrases:** "add a page/section", "Wix site structure", "site styles", "breakpoints", "global.css", "restyle the Wix site"

## Site Anatomy

```
Site
├── Pages (Home, About, ...)             ← editor-only (no page-structure API)
│   └── Sections (vertical stack)        ← the unit of layout
│       └── Grid (rows × columns)        ← Studio section grids
│           └── Elements                 ← text, image, button, gallery, embed, ...
├── Header / Footer (site-wide sections)
├── Site Styles                          ← color palette roles + text theme (editor panels only)
├── src/styles/global.css                ← custom CSS via Git integration (CLI channel)
├── CMS collections                      ← API (wix-data)
└── Site properties / SEO / embeds       ← API
```

**Strategy is template-first:** pick the closest Studio template as the layout seed (from the curated confirmed-Studio allowlist), push content and media through APIs, restyle via theme panels + `global.css`, and keep the browser-automation surface as small as possible. Building every section from a blank canvas maximizes the brittle surface — don't.

## Responsive Breakpoints

| Breakpoint | Range | Notes |
|---|---|---|
| Desktop | 1001px and up | Primary design surface; QA screenshots at 1280 |
| Tablet | 751–1000px | QA at 900 |
| Mobile | 320–750px | QA at 375; stack grids, enlarge touch targets |
| Custom | user-defined | Supported by Studio; avoid unless the design demands it |

Rules:
- Design desktop-first in the editor (Studio cascades changes downward), but verify every breakpoint — the QA phase screenshots all three.
- Grids should collapse: multi-column desktop sections → stacked single-column mobile. Check this explicitly; the editor's automatic stacking guesses.
- Never encode breakpoint-specific pixel values in content; use grid behavior and `--vsp-*` variables with media queries in `global.css`.

## Site Styles (theme panels — editor channel only)

**There is no theme write API.** Palette and text themes are set through Studio's Site Styles panels, which is why these are deterministic Playwright flows in the BuildPlan (`method: "playwright"`).

- **Color roles:** Studio maps a palette onto role slots (main/accent/background ramps, up to ~25 site colors). Vespasian's translate stage compresses the token palette into these slots and **sets every shade explicitly** — letting Wix auto-derive shades causes gradient drift vs the design. Compression losses become FidelityNotes.
- **Text theme:** exactly **9 slots** — H1–H6 + P1–P3. A design system with more type styles spills the overflow into `.vsp-text-*` classes in `global.css`; those styles are invisible to the editor's theme UI (recorded as a FidelityNote).
- **Fonts:** no font-upload API. Builtin fonts are matched via `packages/wix-driver/src/translate/wix-builtin-fonts.json`; a genuinely custom font is a WOFF2 (< 4 MB) uploaded through the editor's font dialog (editor-channel step).

## global.css (CLI channel)

Custom CSS ships through the **Git integration / `wix` CLI** as `src/styles/global.css` — only possible on Studio, and only **after pages exist** in the editor (the code phase is ordered after the editor phase for this reason).

Conventions (Vespasian):
- Spacing tokens: `--vsp-space-*` custom properties (Wix has no spacing-token system of its own).
- Utility classes: `.vsp-p-*` / `.vsp-m-*` (spacing), `.vsp-text-*` (type-ramp overflow).
- Colors in `global.css` reference `--vsp-*` variables or Wix's theme variables — literal hex outside a `--vsp-*` definition is a token-discipline violation (the pre-commit-guard hook flags it).

```css
:root {
  --vsp-space-40: 16px;
  --vsp-space-60: 32px;
}
.vsp-text-display { font-size: 88px; line-height: 1.05; }
.vsp-p-60 { padding: var(--vsp-space-60); }
```

## Operation Channels (which tool for which change)

Full per-operation matrix: `docs/wix/API-COVERAGE.md`. Summary:

| Channel | Operations |
|---|---|
| **API** (REST, `www.wixapis.com`) | create/clone/list sites, editor URLs + editor type, media upload (+ file-ready polling), CMS collections & items, custom embeds, site properties, robots/llms.txt, **publish** |
| **CLI** (Git integration + `wix` CLI) | `src/styles/global.css`, Velo page/backend code — only after pages exist |
| **Playwright** (deterministic editor flows) | create/rename/reorder pages, theme color palette, text theme, font upload, per-page SEO, save |
| **Agent-visual** (Playwright MCP, screenshot-grounded) | canvas composition: add sections/text/images/buttons, position within grids — driven by the wix-site-builder agent because editor DOM selectors are perishable |
| **Hybrid** | image placement (API upload → editor picker), spacing (`global.css` vars + editor defaults) |

**Iron rule:** if an API covers the operation, the API does it. The editor session is never used for API-covered calls, and API keys cannot open the editor. See `wix-playwright-driver` for the editor plane's mechanics.

## Known Gaps (design around these, don't fight them)

- No API for page structure or layout composition — pages/sections/elements are editor-only.
- No theme write API — panels only.
- No spacing tokens in Wix — the scale lives in `global.css`.
- Fixed 9-slot type ramp; overflow → custom CSS classes.
- No font-upload API; no static-page SEO API (editor panel).
- Media needs a file-ready poll before it can be referenced (see `wix-media-first-architecture`).
- No revision-revert API — publish gates are the safety net (see `.claude/config/deployment/`).

## Common Mistakes

1. **Building on a Classic-editor site** — assert `editorType == WIX_STUDIO` first; Classic has no custom CSS and no breakpoints.
2. **Hand-placing colors per element** — set the theme roles once via Site Styles; element-level color overrides bypass the design system and won't update when tokens change.
3. **Pushing `global.css` before pages exist** — the Git integration needs the site scaffolded; respect the phase order.
4. **Trusting editor defaults for shades** — set every palette shade explicitly.
5. **Treating "close enough" type sizes as fine** — snap to the 9 slots or emit an overflow class; never inline `font-size` on elements.
6. **Editing the live site during an apply run** — concurrent human edits invalidate executor assumptions; coordinate.

## Integration

- **Pipelines:** `figma-to-wix-autonomous-workflow`, `canva-to-wix-autonomous-workflow`, `indesign-conversion` all delegate Studio concepts here
- **Skills:** `wix-media-first-architecture` (media), `wix-playwright-driver` (editor mechanics), `wix-cli-workflows` (CLI/REST recipes), `visual-qa-verification` (verifying the result)
- **Agents:** `wix-site-builder` (executes editor work), `frontend-developer`, `ui-designer`, `wix-token-auditor`
- **Code:** `packages/wix-driver/src/translate` (tokens → ThemePlan + global.css), `src/plan`, `src/executor`

---

**Skill Version:** 1.0.0 (replaces fse-block-theme-development)
**Last Updated:** 2026-07-06
