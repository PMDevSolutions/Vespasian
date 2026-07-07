# Figma to Wix — implementation

Technical reference for the Figma pipeline: how a Figma URL becomes a BuildPlan and then a live Wix
Studio site. The orchestration lives in the `figma-to-wix-autonomous-workflow` skill; the
conversion agent is `figma-wix-converter`; the plan executor is the `wix-site-builder` agent +
`packages/wix-driver`.

## Stage 1 — Design extraction (Figma MCP)

Unchanged from the Flavian lineage: the design system is extracted **wholesale**, not
screen-by-screen.

1. **Connect** — `figma-desktop` MCP (`http://127.0.0.1:3845/mcp`, Dev Mode enabled) preferred;
   `figma` remote MCP as fallback. See [docs/mcp-setup.md](../mcp-setup.md).
2. **Extract variables & styles** — `get_variable_defs` (colors, typography, spacing variables),
   published styles, and effect definitions. Everything is captured with **provenance** (which
   Figma variable/style produced which token).
3. **Extract structure** — frames and layers per page: geometry, text content, image fills,
   auto-layout metadata. This becomes the structure IR + content model.
4. **Export assets** — image fills and vectors exported at production resolution, staged locally
   for the media phase.

Output: a design-system JSON (tokens + provenance) and a structure IR — the same neutral artifacts
the Canva and InDesign pipelines produce.

## Stage 2 — Translate (tokens → ThemePlan + global.css)

`packages/wix-driver/src/translate/` compiles the tokens into what Wix can express
(full detail: [docs/wix/theming.md](../wix/theming.md)):

- **Palette** → theme slots + role assignments + the 18 button-state tokens, every shade explicit.
- **Type ramp** → the 9 text-theme slots (H1–H6, P1–P3); overflow styles → custom classes in
  `global.css`. Fonts matched against Wix's built-in list; unmatched families queued for the
  editor's upload dialog (WOFF2, < 4 MB).
- **Spacing** → `--vsp-space-*` custom properties + `.vsp-*` utility classes in `global.css`.
- Every loss (compressed colors, spilled styles) is queued for the FidelityReport.

## Stage 3 — Plan (IR → BuildPlan)

`packages/wix-driver/src/plan/` compiles the IR + content model + ThemePlan into a **BuildPlan**:
an ordered JSON list of steps, each

```json
{
  "id": "…",
  "op": "…",
  "method": "api | cli | playwright | agent",
  "input": { },
  "idempotencyKey": "…",
  "verify": { },
  "onFail": "retry | escalate | skip-and-report"
}
```

Key planning decisions:

- **Template-first** — the closest confirmed-Studio template is chosen as the layout seed
  (`site create` asserts `editorType == WIX_STUDIO`); canvas composition is planned as *deltas*
  against the template, keeping the browser-automation surface minimal.
- **Media-first** — every asset gets an API upload step (+ file-ready poll) *before* any editor
  step references it (`wix-media-first-architecture` skill).
- **Channel routing** — each operation is assigned per
  [docs/wix/API-COVERAGE.md](../wix/API-COVERAGE.md): content/data → API, `global.css`/code → CLI,
  pages/theme panels/SEO → deterministic Playwright flows, canvas composition → agent-visual steps.

Plans are written to `.vespasian/plans/<slug>.json` — serializable, diffable, resumable.

## Stage 4 — Execute (BuildPlan → live site)

`packages/wix-driver/src/executor/` runs the plan in the canonical phase order, checkpointing after
each phase (resume with `vespasian apply --resume-from <phase>`):

1. **Provision** (API) — create from template, assert Studio editor
2. **Media** (API) — upload all assets, poll file-ready
3. **Data** (API) — CMS collections + items
4. **Editor** (Playwright/agent) — pages, theme panels, canvas composition, per-page SEO
5. **Code** (CLI) — `global.css`, Velo files — only after pages exist
6. **Properties & embeds** (API)
7. **Publish** (API; `wix publish` when code shipped)
8. **QA** — screenshots at the three Studio breakpoints, pixel-diff vs the design, FidelityReport

Editor steps follow the probe/flows/recovery model in
[docs/wix/editor-automation.md](../wix/editor-automation.md): deterministic scripts for stable
panels, screenshot-grounded agent driving for the canvas, escalation to the human on CAPTCHA/2FA.

## Validation & error recovery

- **Structure validation** — `scripts/wix-structure-validator/validate-structure.sh` checks the
  BuildPlan JSON shape before apply; `scripts/validate-site.sh` is the umbrella gate.
- **Token audit** — `scripts/design-token-auditor/` rejects literal hex values in translate output
  (everything must reference a theme slot or `--vsp-*` variable).
- **Per-step verify** — each step's `verify` clause is checked after execution (Layers tree
  re-read, API read-back, computed `--wst-*` variables on preview).
- **Failure policy** — `onFail` per step: `retry` (with backoff; 60s on HTTP 429), `escalate`
  (pause for the human), or `skip-and-report` (recorded in the FidelityReport).
- **Dry-run** — `VESPASIAN_DRY_RUN=1` / `vespasian apply --dry-run` swaps all transports for
  recorders; CI validates plan-compile + dry-run apply on every PR (`site-validation` workflow).

## Files involved

| Path | Role |
| --- | --- |
| `.claude/skills/figma-to-wix-autonomous-workflow/` | Orchestration skill (this workflow) |
| `.claude/agents/figma-wix-converter.md` | Extraction + planning agent |
| `.claude/agents/wix-site-builder.md` | Plan execution agent (API + editor) |
| `packages/wix-driver/src/{translate,plan,executor}/` | Translate / plan / execute stages |
| `scripts/figma-wix/` | Deterministic helper scripts |
| `.vespasian/plans/` · `.vespasian/checkpoints/` | Plan + resume state (gitignored) |
| `docs/wix/API-COVERAGE.md` | Channel routing reference |
