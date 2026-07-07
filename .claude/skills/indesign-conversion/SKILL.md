---
name: indesign-conversion
description: Use when converting an Adobe InDesign document (.idml or PDF) into a live Wix Studio site. Covers prerequisites, the parse → map-tokens → plan → apply pipeline, expected outputs, and gotchas (CMYK→sRGB shifts, missing fonts, oversized print images). Keywords: InDesign to Wix, IDML, IDML to Wix, InDesign PDF, print to web, design tokens from InDesign
---

# InDesign Conversion

## Overview

This skill converts an Adobe InDesign document into a live **Wix Studio site** using the `@vespasian/pipeline` InDesign stages plus the `@vespasian/wix-driver` output layer. It parses an exported `.idml` (or a PDF fallback), maps the document's paragraph/character styles and swatches into design tokens, compiles a **BuildPlan** (one page per spread), and applies it to a real Wix site — official APIs first, consent-gated editor automation only where no API exists.

**Key principle:** the design system comes from the document. Swatches → color tokens (→ Studio theme slots), paragraph styles → the 9-slot text theme (+ `.vsp-text-*` overflow), frame geometry → spacing (`--vsp-space-*` in `global.css`) — then content blocks reference token slugs, never inline values. Every lossy translation is recorded as a FidelityNote.

Pair this skill with the **indesign-to-wix** agent, which runs the steps end-to-end and reviews the pipeline report and FidelityReport for follow-ups.

## When to use

- A client/designer hands you an InDesign layout (brochure, flyer, catalog, report) and wants it as a Wix site.
- You have an exported `.idml` file, or only a PDF exported from InDesign.
- You want a deterministic, re-runnable conversion (same input → byte-identical BuildPlan, no diff churn).

Do **not** use this for live Figma or Canva sources — use `figma-to-wix-autonomous-workflow` or `canva-to-wix-autonomous-workflow` instead.

## Prerequisites

- **An exported `.idml` (strongly preferred).** In InDesign: `File → Export → Format: InDesign Markup (IDML)`. IDML preserves stories, frames, styles, swatches, and master spreads.
- **Or a PDF fallback.** PDF reconstruction is lossy — text is rebuilt from glyph runs, styles are synthesized from font sizes, and every approximation is recorded as a fidelity warning. Use only when no `.idml` is available.
- **Node 20+** and the workspace installed (`pnpm install`).
- **Image bytes (optional).** Point `--asset-dir` at the IDML package's `Links/` folder to stage real image bytes; the media phase uploads them to the Wix Media Manager.
- **For a real apply:** `WIX_API_KEY` + `WIX_ACCOUNT_ID` in `.env`; editor steps additionally need `vespasian login --editor`. Without credentials, everything up to and including `apply --dry-run` works offline.

## Workflow

1. **Branch.** `git checkout -b indesign-import/<slug>` — never convert on `main`.
2. **Convert to a plan.** Run the unified CLI:
   ```bash
   vespasian pipeline indesign <input.idml> --plan .vespasian/plans/<slug>
   # add --asset-dir <dir> to stage real image bytes for the media phase
   ```
   This parses, maps tokens, stages assets, and compiles the BuildPlan in one step.
3. **Review the report.** Open the pipeline report next to the plan (`.md` + `.json` twin). Act on unmapped frames, font fallbacks, out-of-gamut colors, and missing alt text. Then run the completion hook for the channel/token summary:
   ```bash
   bash .claude/hooks/figma-wix-completion.sh .vespasian/plans/<slug>/plan.json
   ```
4. **Rehearse.** `vespasian apply .vespasian/plans/<slug>/plan.json --dry-run` — validates ordering and writes the staged `global.css` without touching Wix.
5. **Apply + publish.** `vespasian apply .vespasian/plans/<slug>/plan.json`, then `vespasian publish`. Canvas-composition steps run through the wix-site-builder agent; media uploads poll file-ready before placement.
6. **Verify.** `vespasian qa` — screenshots at the three Studio breakpoints vs the spread renders, plus the FidelityReport.

## Expected outputs

```
.vespasian/plans/<slug>/
├── tokens.json                 # swatches + styles mapped to the flat token shape
├── ir.json                     # spread/frame structure (layout intent)
├── content.json                # sections + typed blocks (one page per spread)
├── assets.manifest.json        # staged assets with semantic slugs
├── global.css                  # --vsp-space-* vars, .vsp-text-* overflow classes
├── plan.json                   # compiled BuildPlan (schema-valid, deterministic)
└── plan-report.md              # human-readable report: Artifacts / Steps / Design tokens / Assets / Fidelity notes
```

Plus, after apply/qa: a live Wix Studio site, checkpoints under `.vespasian/checkpoints/`, and the FidelityReport under `.claude/reports/`.

## Frame → Wix mapping

- Text frames → text elements bound to text-theme slots (role from the paragraph-style name: `Heading N` → H*n*, `Body` → P2, `Caption` → P3), grouped into sections.
- Image frames → image elements referencing staged media; text-over-image → section background media with overlaid text.
- Side-by-side frames → section grid columns.
- Master-spread top/bottom chrome → header/footer intent (usually a restyle of the Studio template's header/footer rather than a rebuild).
- Print-specific artifacts (bleed marks, spreads-as-facing-pages) → dropped, recorded in the report.

## Worked example (committed fixture)

The pipeline ships a code fixture (no committed binaries) and a smoke test that builds a two-spread brochure and asserts a valid BuildPlan:

```bash
node scripts/indesign-wix/smoke-test.mjs
```

To convert your own document and inspect the plan:

```bash
vespasian pipeline indesign ./brochure.idml --plan .vespasian/plans/brochure
jq '.steps[] | {id, method, phase}' .vespasian/plans/brochure/plan.json | head -30
cat .vespasian/plans/brochure/plan-report.md
```

You can also drive the stages individually (useful for debugging):

```bash
node packages/pipeline/bin/parse-idml.mjs brochure.idml > ir.json
node packages/pipeline/bin/map-tokens.mjs ir.json --out-dir ./tokens
node packages/pipeline/bin/stage-assets.mjs ir.json --asset-dir ./Links
vespasian plan .vespasian/plans/brochure/
```

## Common gotchas

- **CMYK/LAB → sRGB shifts.** Print color spaces don't map 1:1 to screen. The mapper converts and flags any out-of-gamut swatch; expect brand colors to look slightly different and confirm with the designer. Studio theme slots then set shades **explicitly** to avoid Wix's auto-gradient drift.
- **Missing / substituted fonts.** InDesign fonts that aren't web-available fall back via `packages/pipeline/config/font-map.json`, then match against Wix builtins (`wix-builtin-fonts.json`). No font-upload API exists — a real custom font means a WOFF2 (< 4 MB) uploaded through the editor dialog (editor-channel step). Every fallback is a FidelityNote.
- **Oversized print images.** Print assets are often huge (300 DPI, CMYK). Resize/recompress for web and convert to sRGB before staging (`scripts/assets/optimize-images.sh`), or uploads are slow and render with muddy color.
- **PDF fidelity.** A PDF parse always carries warnings — text reconstructed from glyphs, synthesized styles, dropped vector art. Prefer `.idml`; treat PDF output as a starting point that needs review.
- **Absolute print layout → grid intent.** Spread geometry becomes section/grid intent, not coordinates. Multi-column print layouts may reflow; check the tablet/mobile breakpoints in QA.
- **Empty alt text.** Generated image blocks default to `alt: ""`. Add meaningful alt text (the agent proposes some from surrounding story text) before publishing.
- **Don't hand-edit the plan destructively.** Plans are deterministic; re-running the pipeline regenerates them. Fix the source document or the pipeline rather than patching `plan.json`.

## Related

- Agent: `indesign-to-wix` (orchestrates + reviews the report)
- Docs: `docs/pipelines/indesign.md`, `docs/wix/ARCHITECTURE.md`, `docs/wix/API-COVERAGE.md`
- Skills: `wix-media-first-architecture`, `wix-site-development`, `visual-qa-verification`
