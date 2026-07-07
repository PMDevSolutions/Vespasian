# Canva to Wix — user guide

Convert a Canva HTML/CSS export into a live **Wix Studio** site. Works alongside the
[Figma](../figma-to-wix/README.md) and [InDesign](../pipelines/indesign.md) pipelines.

## Quick start

1. **Export your Canva design as HTML/CSS** (see [EXPORT-GUIDE.md](EXPORT-GUIDE.md))
2. **Tell Claude Code:** "Convert this Canva export to Wix" and provide the export directory path
3. **Claude autonomously** extracts design tokens from the CSS, derives page structure from the
   HTML, compiles a **BuildPlan**, and applies it to your target Wix site — APIs first, editor
   automation only where no API exists.

## What you get

- A **live Wix Studio site** — pages, sections, text, images seeded from the closest Studio template
- `.vespasian/plans/<slug>.json` — the compiled BuildPlan (serializable, diffable, resumable)
- Theme panels populated from your CSS tokens + a `global.css` with the spacing scale and
  typography overflow ([theming](../wix/theming.md))
- A **FidelityReport** recording every translation loss honestly

## Prerequisites

- Canva account (Pro recommended for direct HTML export)
- Claude Code with this project configured
- Export directory with HTML + CSS files
- Wix credentials in `.env` ([docs/PREREQUISITES.md](../PREREQUISITES.md)); editor steps require
  the one-time `vespasian login --editor` consent

## How it works

1. CSS is parsed for design tokens (colors, fonts, spacing) by `scripts/canva-wix/parse-canva-export.sh`
2. HTML structure is converted to Wix section/element **intent** by
   `scripts/canva-wix/convert-html-to-wix.sh` — headings map to the H1–H6 theme slots, text to
   P1–P3, images to media-upload steps + placement intent
3. The intent + tokens compile into a BuildPlan (`packages/wix-driver`), validated by
   `scripts/wix-structure-validator/validate-structure.sh`, then applied
   (`vespasian apply`) — same executor phases as every other pipeline

Plan-shape examples: [docs/figma-to-wix/EXAMPLES.md](../figma-to-wix/EXAMPLES.md) (shared format).

## Comparison with the Figma pipeline

| Aspect | Figma pipeline | Canva pipeline |
|--------|---------------|----------------|
| Input | Live MCP connection | Static HTML/CSS export |
| Token provenance | Figma variables/styles | CSS custom properties + computed values |
| Best for | Complex multi-page sites | Landing pages, simple sites |
| Automation | Fully automated via MCP | Automated after export |

## CI integration test

The deterministic half of the pipeline is guarded by the `canva-pipeline` workflow
(`.github/workflows/canva-pipeline.yml`), which runs against a committed fixture export in
`tests/fixtures/canva/landing/`:

1. Runs the helper scripts (`parse-canva-export.sh`, `convert-html-to-wix.sh`) on the fixture and
   asserts their output is valid.
2. Compiles a BuildPlan from the fixture and **dry-run applies** it (`VESPASIAN_DRY_RUN=1`) —
   asserting the plan validates and every step routes to a legal channel. No Wix credentials are
   used in CI.

Because the converter itself is an LLM agent (which can't run reproducibly in CI), the fixture's
golden plan stands in for "what a good agent run produces."

Run it locally:

```bash
pnpm test:canva-e2e
./tests/libs/bats-core/bin/bats tests/canva-wix/convert-html-to-wix.bats   # after: git submodule update --init
```

## Troubleshooting

- **Missing colors** — check the CSS file has hex or `rgb()` colors; fallback tokens are used automatically
- **Broken layouts** — Canva div-soup translates to coarse section intent; expect manual refinement in the Wix editor, recorded in the FidelityReport
- **Missing images** — ensure images are exported alongside the HTML; every image needs a media-upload step before placement
- Full failure catalog: [docs/COMMON-FAILURES-FIXES.md](../COMMON-FAILURES-FIXES.md)
