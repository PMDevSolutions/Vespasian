---
name: canva-to-wix-autonomous-workflow
description: Use when converting Canva HTML/CSS exports into a live Wix Studio site. Orchestrates the autonomous workflow from CSS token extraction through BuildPlan compilation, apply, visual QA, and FidelityReport. Keywords: Canva to Wix, Canva export, CSS design tokens, HTML conversion, autonomous site generation
---

# Canva-to-Wix Autonomous Workflow

## Overview

This skill orchestrates the autonomous conversion of a **Canva HTML/CSS export** into a live **Wix Studio site**. It is the Canva-source sibling of `figma-to-wix-autonomous-workflow`: the ingestion front end differs (static CSS/HTML parsing instead of Figma MCP calls), everything downstream — tokens.json, BuildPlan, `vespasian apply`, visual QA, FidelityReport — is identical and shared.

**The flow:**

```
Canva export directory (index.html, style.css, assets/)
  → parse CSS → design tokens                (colors, font stacks, sizes, spacing)
  → parse HTML → sections + content blocks   (headings, paragraphs, images, buttons)
  → write pipeline artifacts                  (tokens.json, ir.json, content.json, assets.manifest.json)
  → compile BuildPlan                         (vespasian plan → .vespasian/plans/<slug>/plan.json)
  → apply                                     (vespasian apply — API first; wix-site-builder agent for editor steps)
  → visual QA vs the exported HTML render     (vespasian qa / visual-qa-agent)
  → FidelityReport
```

**Key Principle:** identical to the Figma pipeline — tokens FIRST, structure SECOND, plan THIRD, apply FOURTH, verify FIFTH. Same fallback token tables, same checkpointing, same no-exceptions list. This skill documents only what differs for Canva; for everything else follow `figma-to-wix-autonomous-workflow`.

## When to Use

Use this skill when:
- The user provides a Canva export directory (HTML/CSS/assets) or ZIP
- Converting a Canva design to a Wix site
- The design source is Canva, not Figma or InDesign

**Trigger phrases:** "Convert Canva to Wix" · "Canva export" · "Turn this Canva design into a Wix site"

When NOT to use:
- Figma sources → `figma-to-wix-autonomous-workflow`
- InDesign (.idml/PDF) → `indesign-conversion`

**Upgrade path (optional):** when a Canva remote MCP connection is available, prefer exporting the design live (`export-design`) over asking the user for a manual Website → HTML export — the downstream parsing is the same.

## Prerequisites

- [ ] Canva export directory on disk (Share → Download → HTML, or an MCP export)
- [ ] Export contains `index.html` + CSS (inline or linked) + `assets/` images
- [ ] `WIX_API_KEY` + `WIX_ACCOUNT_ID` in `.env` — or `VESPASIAN_DRY_RUN=1`
- [ ] For editor-channel steps: a consented session (`vespasian login --editor`)

Output location rules and the PreToolUse guard are identical to the Figma skill: artifacts under `.vespasian/plans/<slug>/`, never `themes/` or `wp-content/`.

## The Workflow (Canva-specific deltas only)

### Phase 1: Discovery & Token Extraction

**Step 1.1: Parse the export and extract tokens FIRST**

```bash
# Inventory + sanity-check the export (warns on missing CSS/assets)
./scripts/canva-wix/parse-canva-export.sh <export-dir>
```

Extract from the CSS, wholesale:
- **Colors:** every distinct `color` / `background-color` / `border-color` value → deduplicate, name by role (dominant background → `background`, most-used text color → `black`/`body`, brand hues → `primary`/`accent-*`)
- **Typography:** `font-family` stacks → `fontFamilies`; the set of `font-size` values → a mapped scale (snap to the closest slug in the 9-point scale — Wix's text theme has exactly 9 slots)
- **Spacing:** `margin` / `padding` / `gap` values → snap to the 4px-based scale

Merge with the fallback token tables from `figma-to-wix-autonomous-workflow` (Canva values win, fallbacks fill gaps — Canva exports are often sparse: a single page may only carry 3-4 colors). Write `.vespasian/plans/<slug>/tokens.json`.

**Step 1.2: Survey pages**

A Canva Website export is one HTML document per page. Enumerate the page files; render each in a browser (Playwright MCP) and screenshot it — these screenshots are the QA baselines (there is no Figma to compare against).

**Step 1.3: HTML-element → Wix mapping**

| Canva export HTML | Wix Studio target | Channel |
|---|---|---|
| Top-level `<section>` / positioned group `<div>` | Section | agent |
| `<h1>`–`<h6>` | Text element bound to the matching text-theme slot | agent |
| `<p>`, `<span>` text runs | Text element (P1–P3 by size) | agent |
| `<img>` | Image element referencing **staged** media | hybrid (API upload → placement) |
| Anchor styled as button | Button element | agent |
| Repeated card markup | Section grid with repeated containers | agent |
| Background images / overlays | Section background media | agent |
| Absolutely-positioned clusters | Grid-cell intent (record a FidelityNote — Canva's absolute layout → Studio grid is lossy) |

```bash
# Structure conversion helper (HTML → sections/blocks JSON), if present:
./scripts/canva-wix/convert-html-to-wix.sh <export-dir> .vespasian/plans/<slug>/
```

**Canva-specific gotchas:**
- Exports use absolute positioning heavily — translate to section/grid *intent*, never coordinate-copy; record the translation as a FidelityNote.
- Font names in exports are often Canva-licensed fonts you cannot upload. Map to the closest builtin via `packages/wix-driver/src/translate/wix-builtin-fonts.json`; every substitution is a FidelityNote.
- Image filenames are opaque (`image1.png`) — the MANDATORY asset semantic-mapping step (view every image, write `.claude/figma-data/asset-semantic-mapping.json`) applies exactly as in the Figma skill.
- Exported HTML embeds text as styled `<div>`s occasionally rendered as images — if text is baked into a PNG, extract the copy manually and rebuild it as a real text element.

**Step 1.4-1.5:** plan via `superpowers:writing-plans`, present, get approval — identical to the Figma skill.

### Phase 2: Autonomous Execution

Identical to `figma-to-wix-autonomous-workflow` Phase 2, with the source swapped:

1. Asset semantic mapping (mandatory) over the export's `assets/`
2. Per-page loop: HTML section parsing (instead of `get_code`), token matching, IR/content emission, `figma-wix-post-page.sh` warn-only hook after each artifact
3. `vespasian plan .vespasian/plans/<slug>/` → completion hook
4. `vespasian apply --dry-run` → `vespasian apply` (API first; `agent` steps via wix-site-builder)
5. Checkpoint every 3 pages via episodic-memory; executor checkpoints under `.vespasian/checkpoints/`

**Error recovery delta:** there is no MCP to fail — parsing errors are handled by falling back from DOM parsing to a rendered-screenshot visual analysis of the export (Playwright MCP renders the local HTML file). Same "log, recover, continue" discipline.

### Phase 2.7: Visual Verification (baseline = rendered export)

Render the **local Canva export** in the browser as the source of truth, then compare the published Wix pages against it at the three Studio breakpoints (1280/900/375). Caveat: the Canva export itself is usually not responsive — compare desktop 1:1, and judge tablet/mobile against layout *intent* (stacking, readable type), recording deliberate deviations as FidelityNotes.

```bash
# Optional side-by-side report, if present:
./scripts/canva-wix/generate-comparison-report.sh <export-dir> <published-url>
```

### Phase 3: Completion

Identical: publish, `vespasian qa`, FidelityReport, completion report via `bash .claude/hooks/figma-wix-completion.sh`, handoff with live + editor URLs.

## No-Exceptions List

All nine items from `figma-to-wix-autonomous-workflow` apply verbatim, plus:

10. ❌ **Never coordinate-copy Canva's absolute layout** — translate to section/grid intent and record the loss.
11. ❌ **Never ship Canva-licensed font files to Wix** — builtin match or user-provided licensed WOFF2 only.

## Integration with Skills & Agents

- **Shares:** fallback tokens, checkpoint/resume, quality gates, and the verification bar with `figma-to-wix-autonomous-workflow` (see also its [TESTING-GUIDE.md](../figma-to-wix-autonomous-workflow/TESTING-GUIDE.md) — the dry-run and live smoke procedures apply to this pipeline unchanged, minus the Figma MCP steps)
- **Delegates to:** `wix-site-development`, `wix-media-first-architecture`, `wix-playwright-driver`, `visual-qa-verification`, `superpowers:writing-plans` / `superpowers:executing-plans`
- **Agents:** `canva-wix-converter` (owns this pipeline) → `wix-site-builder` → `visual-qa-agent`

## Example Usage

```
User: "Convert this Canva export to Wix" [path/to/canva-export/]

Claude: "Using the canva-to-wix-autonomous-workflow skill."
        [parses CSS → 6 colors, 2 font stacks, 5 sizes; merges fallbacks → tokens.json]
        [renders 3 page files → QA baselines]
        "3 pages, 14 images to stage, ~30 plan steps. 2 fonts will map to
         Wix builtins (recorded as fidelity losses). Proceed?"

User: "Yes"

Claude: [semantic-maps all 14 images]
        [emits artifacts → vespasian plan → dry-run → apply → publish → qa]
        "✅ Live at https://<account>.wixstudio.io/<site> — FidelityReport
         lists 4 losses. Report: .claude/reports/figma-wix-completion-<ts>.md"
```

---

**Version:** 2.0.0 (Wix target)
**Last Updated:** 2026-07-06
