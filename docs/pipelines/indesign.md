# InDesign → Wix pipeline

Convert an Adobe InDesign document into a **BuildPlan** ready to apply to a live Wix Studio site:
one section-intent group per spread, mapped design tokens (colors, typography, spacing), staged
assets, and a generation report.

This is the user-facing guide. For the internals, see the package docs:
[IDML parser & IR](../../packages/pipeline/README.md),
[token mapper](../pipeline/indesign-token-mapper.md), and
[output stage](../pipeline/indesign-output-generator.md).

## At a glance

```bash
# One command: parse → map design tokens → compile the BuildPlan
node bin/vespasian.mjs pipeline indesign brochure.idml --plan .vespasian/plans/brochure.json

# Then rehearse and apply it
node bin/vespasian.mjs apply .vespasian/plans/brochure.json --dry-run
node bin/vespasian.mjs apply .vespasian/plans/brochure.json
node bin/vespasian.mjs publish
```

The InDesign pipeline sits alongside the [Figma](../figma-to-wix/README.md)
and [Canva](../canva-to-wix/README.md) pipelines. Use it when your source
of truth is a print/layout document rather than a live design tool.

## 1. Export from InDesign

### IDML (preferred)

`File → Export…` → **Format: InDesign Markup (IDML)**.

IDML is a structured package: it preserves stories (text), frames (geometry),
paragraph/character styles, swatches, and master spreads. This is the
high-fidelity path — use it whenever you can.

If your document links images and you want them staged for the media-upload phase, also keep
the package's `Links/` folder handy (or use `File → Package…`) and pass it via
`--asset-dir`.

### PDF (fallback)

`File → Export…` → **Adobe PDF**. Use this only when you can't get an `.idml`.

PDF reconstruction is **lossy by design**: text is rebuilt from positioned glyph
runs, paragraph styles are *synthesized* from font-size buckets, vector art is
dropped, and color is read per-run. Every approximation is recorded as a
fidelity warning. See [PDF fidelity](../pipeline/indesign-pdf-fidelity.md) for
the full list and the round-trip tolerances against IDML.

## 2. Run the pipeline

```bash
node bin/vespasian.mjs pipeline indesign <input.idml|input.pdf> [options]
```

| Option | Effect |
| --- | --- |
| `--plan <path>` | BuildPlan output path (default `<plan-dir>/plan.json`, i.e. `.vespasian/plans/<slug>/plan.json`). |
| `--config <path>` | Vespasian config file (default `./vespasian.config.json` if present). |
| `--slug <str>` | Site/plan slug (default: from the document name). |
| `--name <str>` | Site display name. |
| `--namespace <str>` | Derived-token slug prefix (default `id`). |
| `--asset-dir <dir>` | Source of image bytes to stage for the media phase (matched by basename). |
| `--dpi <n>` | DPI when parsing `.idml`/`.pdf` directly (default 96). |
| `--fluid` | Emit fluid `clamp()` font sizes. |
| `-q, --quiet` | Suppress the stderr summary. |

Run `node bin/vespasian.mjs pipeline indesign --help` for the authoritative list; CLI flags
override values from `vespasian.config.json`
(see [`vespasian.config.example.json`](../../vespasian.config.example.json)).

## 3. Expected output

All artifacts land under `.vespasian/plans/<slug>/` (slug from the document name, or `--slug`):

```
.vespasian/plans/<slug>/
├── ir.json                 # parsed intermediate representation
├── content.json            # derived content model
├── tokens.json             # mapped design tokens (with provenance)
├── assets.manifest.json    # staged-asset inventory + `warnings` array (unresolved bytes, etc.)
├── assets/                 # staged image bytes for the media-upload phase
├── plan.json               # the BuildPlan: provision, media, editor, css, publish steps
└── plan-report.md          # human-readable generation report (Artifacts · Steps ·
                            #   Design tokens · Assets · Fidelity notes · Next)
```

The command finishes with a `next:` hint printing the exact `vespasian apply` path for the
compiled plan.

Everything under `.vespasian/` is gitignored working state — the real output is the live Wix site
that `vespasian apply` builds from the plan.

### Frame → intent mapping

- **Text frames** → heading/paragraph intent grouped per spread section. The paragraph-style name
  picks the role: `Heading N` → the corresponding `H1`–`H6` theme slot; `Body`/`Caption`/etc. →
  a paragraph slot (`P1`–`P3`). Typography and color come from the mapped **design tokens**
  (theme slots and `--vsp-*` variables), never inline values.
- **Image frames** → an API media-upload step + placement intent; a frame with overlaid text
  becomes a background-image section intent.
- **Side-by-side frames** → multi-column section grid intent.
- **Master-spread chrome** → header/footer intent (mapped onto the chosen template's header/footer
  sections).

## 4. Fidelity expectations

| Aspect | IDML | PDF |
| --- | --- | --- |
| Text content | Exact (from stories) | Reconstructed from glyph runs |
| Paragraph styles | Exact | Synthesized from font sizes |
| Colors | Exact swatches (CMYK/LAB → sRGB) | Sampled per run |
| Frame geometry | Exact | Reconstructed (clustering) |
| Vector art | Not imported | Dropped (warned) |
| Images | Referenced; staged via `--asset-dir` | Extracted to an asset cache |

Three conversions are inherent regardless of source:

- **CMYK/LAB → sRGB.** Print color doesn't map 1:1 to screen. Out-of-gamut
  swatches are clamped and flagged in the report; confirm brand colors with the
  designer.
- **Fonts.** Non-web fonts fall back via `packages/pipeline/config/font-map.json`
  (often a Google font). Every fallback is listed in the report; unmatched families can be
  uploaded through the Wix editor's font dialog (WOFF2, < 4 MB).
- **Print layout → section/grid intent.** Absolute print geometry is translated into Wix Studio
  section intent — not pixel-replicated. Losses are recorded in the FidelityReport when the plan
  is applied.

## 5. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Plan fails validation | Run `scripts/shared/plan-lint.sh <plan.json>` — it pinpoints the bad steps; mapper warnings are in `plan-report.md`'s **Fidelity notes** table. |
| Colors look washed out / shifted | CMYK→sRGB conversion. Convert source images to sRGB and confirm swatches against the out-of-gamut entries in the report's **Fidelity notes** table. |
| Missing or wrong fonts | A font fell back. Check the `fonts.*` entries in the report's **Fidelity notes** table; upload the real font via the editor dialog and update the font map, or accept the substitution. |
| Images don't appear on the site | Bytes weren't staged. Check the `warnings` array in `assets.manifest.json` (the expected staged paths are in its `assets` list), re-run with `--asset-dir`, then re-apply — media steps poll for file-ready before placement. |
| Huge / slow pages | Oversized print images (300 DPI, CMYK). Run `scripts/assets/optimize-images.sh` (or resize manually) before applying. |
| PDF output looks rough | PDF is a lossy fallback — re-export an `.idml` if at all possible. |
| Frames missing from the plan | Check the `warnings` array in `assets.manifest.json` and the report's **Fidelity notes** table (e.g. a text frame with no story, an image frame with no resolvable bytes). Add the content in the Wix editor or fix the source document. |

## Sample fixtures

The canonical sample document — a two-spread **Spring Brochure** — lives under
[`tests/fixtures/indesign/`](../../tests/fixtures/indesign/) as code (no
committed binaries). Materialize it to real files to try the pipeline:

```bash
node tests/fixtures/indesign/emit.mjs /tmp/fix
node bin/vespasian.mjs pipeline indesign /tmp/fix/brochure.idml --plan .vespasian/plans/brochure.json
node bin/vespasian.mjs pipeline indesign /tmp/fix/brochure.pdf  --plan .vespasian/plans/brochure-pdf.json
```

## Smoke & fixture tests

End-to-end tests build the fixtures in code, run them through the full pipeline,
and assert a valid plan — for both the `.idml` (primary) and PDF (fallback)
paths. Both run in CI on any change to the pipeline package or its scripts.

```bash
node scripts/indesign-wix/smoke-test.mjs                # real CLI, IDML path
node --test tests/fixtures/indesign/fixtures.test.mjs   # IDML + PDF → plan
```

## See also

- [Output stage internals](../pipeline/indesign-output-generator.md)
- [Token mapper internals](../pipeline/indesign-token-mapper.md)
- [PDF fidelity](../pipeline/indesign-pdf-fidelity.md)
- Agent: `.claude/agents/indesign-to-wix.md`
- Skill: `.claude/skills/indesign-conversion/SKILL.md`
