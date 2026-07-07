# InDesign output stage: guide (BuildPlan compile)

The output stage is stage 4 — the final compile stage — of the InDesign-to-Wix
pipeline. It takes the enriched IR from the [ingest stage](ingest-stage.md)
(IDML or [PDF fallback](indesign-pdf-fidelity.md)) plus the
[token mapper's](indesign-token-mapper.md) design tokens, runs them through the
Wix **translate** and **plan** stages (`packages/wix-driver/src/translate/`,
`packages/wix-driver/src/plan/`), and emits a complete, executable **BuildPlan**.

Where Flavian's equivalent stage wrote a theme directory to disk, Vespasian's
compiles instructions for a live site — the BuildPlan is the contract between
the design pipeline and the Wix output layer
(see [docs/wix/ARCHITECTURE.md](../wix/ARCHITECTURE.md#buildplan)).

| Artifact | What it is |
| --- | --- |
| `.vespasian/plans/<slug>/plan.json` | The BuildPlan: ordered steps `{ id, op, method: api\|cli\|playwright\|agent, input, idempotencyKey, verify, onFail }`. |
| ThemePlan (embedded) | The editor panel edits: palette slot assignments, text-theme slots, font uploads. |
| `global.css` artifact | Spacing scale (`--vsp-space-*`), typography overflow classes, shipped via the Wix CLI channel. |
| Staged assets | Deterministic filenames under `.vespasian/plans/<slug>/assets/`, matched from `--asset-dir` by basename; each becomes an API media-upload step. |
| `plan-report.md` | Human-readable generation report: Artifacts, Steps, Design tokens, Assets, Fidelity notes, Next. |
| `assets.manifest.json` | Machine-readable staged-asset inventory, with a `warnings` array for unresolved bytes and other follow-ups. |

## Usage

```bash
# One shot, via the CLI (parse → map → translate → plan):
node bin/vespasian.mjs pipeline indesign brochure.idml \
  --plan .vespasian/plans/brochure.json --asset-dir ./extracted-images

# Or compile a plan from an already-ingested IR artifact:
pnpm pipeline:ingest brochure.idml --out build/brochure.ir.json
node bin/vespasian.mjs plan build/brochure.ir.json
```

Then execute it:

```bash
node bin/vespasian.mjs apply .vespasian/plans/brochure.json --dry-run   # rehearse, no Wix calls
node bin/vespasian.mjs apply .vespasian/plans/brochure.json             # build the live site
```

Plan compilation is **pure and deterministic**: no filesystem side effects
beyond the declared outputs, no clock, no randomness. The same IR yields an
identical plan every run, so re-runs never produce diff churn — and stable
`idempotencyKey`s mean re-applying a plan skips already-completed steps.

## How frames become plan steps

Each spread is laid out top-to-bottom in reading order, then mapped to
section/element **intent** (executed by the `wix-site-builder` agent — see
[plan-shape examples](../figma-to-wix/EXAMPLES.md)):

- **Text frames** → heading/paragraph intent inside a per-spread section. A
  run's paragraph style decides the role: `Heading N` → the `H1`–`H6` theme
  slot; `Body`/`Caption`/etc. → a paragraph slot. Font, size, and color always
  reference the mapped **design tokens** (theme slots, `--vsp-*` variables),
  never inline values.
- **Image frames** → an API media-upload step (with file-ready poll) plus
  placement intent; when text overlays the image, a background-image section
  intent.
- **Side-by-side frames** (overlapping vertical bands) → multi-column section
  grid intent, left to right.

### Header/footer from masters

A master spread's repeating chrome is split by vertical position: text in the
top band becomes header intent, text in the bottom band becomes footer intent
(running heads / page-number chrome → a footer line). These are mapped onto the
chosen Studio template's header/footer sections; with no usable master, the
template's defaults stand and the report flags it.

### Assets

The plan is compiled from the IR, which carries image *references*, not bytes.
Every image frame gets a deterministic staged filename
(`spread-N-image-K.ext`); pass `--asset-dir` to have the CLI copy the real
bytes into `.vespasian/plans/<slug>/assets/` (matched by basename). Missing
bytes are recorded in `assets.manifest.json`'s `warnings` array — the executor
skips-and-reports those uploads rather than failing the whole apply.

## Acceptance criteria

| Criterion | How it's met |
| --- | --- |
| End-to-end on a fixture `.idml` produces a plan that dry-run applies cleanly. | `vespasian apply --dry-run` executes every step against the recording transports; the `site-validation` CI workflow gates PRs on exactly this. |
| ≥ 1 section intent per spread. | One canvas-composition step group per spread, ordered by reading order. |
| The plan round-trips through validation. | zod schema validation at compile time + `scripts/shared/plan-lint.sh <plan.json>`. |
| Report enumerates produced steps and unresolved inputs. | `plan-report.md` — **Steps** and **Fidelity notes** tables; `assets.manifest.json` — `warnings` array. |
| Plans are deterministic given the same IR. | Pure compile; a determinism test asserts two runs are byte-identical. |

## Testing

```bash
pnpm test:pipeline                                      # packages/pipeline suite
node scripts/indesign-wix/smoke-test.mjs                # real CLI, IDML path
node --test tests/fixtures/indesign/fixtures.test.mjs   # IDML + PDF → plan
```
