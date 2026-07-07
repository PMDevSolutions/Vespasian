# Figma to Wix — user guide

Convert a Figma design into a live **Wix Studio** site, autonomously, through Claude Code.

## Quick start

1. **Prerequisites** — a Figma Professional+ plan (Dev Mode), the Figma MCP configured
   ([docs/mcp-setup.md](../mcp-setup.md)), and Wix credentials in `.env`
   ([docs/PREREQUISITES.md](../PREREQUISITES.md)).
2. **Tell Claude Code:**

   ```
   Convert this Figma design to Wix: <your-figma-url>
   ```

3. **Claude runs the autonomous workflow** (the `figma-to-wix-autonomous-workflow` skill with the
   `figma-wix-converter` agent): design tokens and page structure are extracted through the Figma
   MCP, translated into a **BuildPlan**, and applied to your target Wix site — APIs first, editor
   automation only where no API exists.

Typical runtime: 15–90 minutes depending on page count and how much canvas composition the design
needs. Steps that require the editor plane pause for consent if you have never run
`vespasian login --editor`.

## What you get

| Artifact | What it is |
| --- | --- |
| A **live Wix Studio site** | Pages, sections, text, images, buttons — provisioned from the closest Studio template and composed to match the design |
| `.vespasian/plans/<slug>.json` | The compiled **BuildPlan** — serializable, diffable, resumable |
| Theme panels + `global.css` | Palette and text theme applied via Site Styles; spacing tokens and typography overflow shipped as `--vsp-*` custom CSS ([theming](../wix/theming.md)) |
| Uploaded media | All design assets staged through the Media Manager API before any editor step references them |
| **FidelityReport** | Every translation loss, recorded honestly — palette compression, spilled type styles, layout intent changes, API→editor fallbacks |

## How it works (summary)

```
Figma URL
  → Figma MCP: variables, styles, frames        (design tokens + structure IR)
  → translate: ThemePlan + global.css           (packages/wix-driver)
  → plan: BuildPlan                             (ordered steps: api | cli | playwright | agent)
  → apply: live Wix site                        (provision → media → data → editor → code → publish)
  → qa: screenshots + FidelityReport
```

Full technical detail: [IMPLEMENTATION.md](IMPLEMENTATION.md). Example plan snippets the converter
agent works from: [EXAMPLES.md](EXAMPLES.md). Channel routing (what uses APIs vs the browser):
[docs/wix/API-COVERAGE.md](../wix/API-COVERAGE.md).

## Expectations — read this

- **Pixel-perfect is not the contract.** Wix has no layout-composition API and a constrained theme
  model; the design is translated into template + section/grid intent and the differences are
  recorded in the FidelityReport. See
  [Where Wix doesn't map](../wix/API-COVERAGE.md#where-wix-doesnt-map).
- **Editor automation is consent-gated.** Pages, theme panels, and canvas work drive the real Wix
  editor on your own account — a Wix ToS gray area, off until you run `vespasian login --editor`.
  See [editor-automation](../wix/editor-automation.md).
- **Dry-run first if you like:** `vespasian apply <plan> --dry-run` rehearses the whole plan with
  no Wix calls.

## Troubleshooting

| Symptom | See |
| --- | --- |
| Figma MCP not connecting / no tokens extracted | [docs/MCP-TROUBLESHOOTING.md](../MCP-TROUBLESHOOTING.md) |
| Wix auth errors, 429s, editor session expired | [docs/TROUBLESHOOTING.md](../TROUBLESHOOTING.md) |
| Pipeline failure catalog with recovery steps | [docs/COMMON-FAILURES-FIXES.md](../COMMON-FAILURES-FIXES.md) |
| Verifying the finished site | [docs/E2E-VALIDATION.md](../E2E-VALIDATION.md) |
