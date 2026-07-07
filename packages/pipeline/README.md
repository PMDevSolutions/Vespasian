# @vespasian/pipeline

The **input side** of Vespasian: parse a design source (InDesign IDML, or a PDF
fallback), derive a neutral design IR plus a semantic content model, map the
design system into neutral design tokens, and stage the document's image bytes
into an asset bundle. Everything this package emits is output-target neutral —
no WordPress, no Wix specifics.

## Where it sits

```
design in (InDesign .idml / .pdf)
   → parse   → IR                      (parse-idml / parse-pdf)
   → ingest  → IR + content model      (ingest: detect + validate + enrich)
   → map     → tokens.json             (mapTokens: token groups + DTCG + report)
   → stage   → ir.json, assets/, assets.manifest.json   (asset stage)
   ──────────── file-artifact handoff ────────────
   → @vespasian/wix-driver             (translate → plan → execute → live Wix site)
```

The handoff to [`@vespasian/wix-driver`](../wix-driver/) is **files, not
imports**: the driver consumes `ir.json`, `tokens.json`, and
`assets.manifest.json` (+ the staged `assets/` bytes). That makes the JSON
shapes emitted by the `bin/` CLIs the contract between the two packages. See
[`docs/wix/ARCHITECTURE.md`](../../docs/wix/ARCHITECTURE.md) for the output
layer this feeds.

IDML is the primary path (full access to stories, frames, styles, swatches,
masters). PDF is a lossy fallback for when only the exported PDF is available,
or as a verification source against IDML output — see
[`docs/pipeline/indesign-pdf-fidelity.md`](../../docs/pipeline/indesign-pdf-fidelity.md).

## Layout

```
packages/pipeline/
├── bin/
│   ├── parse-idml.mjs        CLI: IDML → validated IR JSON on stdout
│   ├── parse-pdf.mjs         CLI: PDF → reconstructed IR JSON on stdout
│   ├── ingest.mjs            CLI: bytes (sniffed) → IR + content model artifact
│   ├── map-tokens.mjs        CLI: IR (or .idml/.pdf) → tokens.json artifact
│   └── stage-assets.mjs      CLI: source → ir.json + assets/ + assets.manifest.json
├── config/
│   ├── base-tokens.json      Bundled neutral base token set (palette, fonts, scale, spacing)
│   └── font-map.json         InDesign family → web font fallback table
└── src/
    ├── index.js              Re-exports the InDesign surface
    └── indesign/
        ├── ir.js             zod schemas + JSDoc typedefs for the IR
        ├── parse-idml.js     IDML entry: unzips + orchestrates + cross-refs + validates
        ├── parse-pdf.js      PDF entry: extracts + clusters + classifies + validates
        ├── layout.js         Spread frames → reading-order rows + column/cover detection
        ├── color.js          Shared color math: RGB/CMYK/LAB → sRGB + gamut, nearest-swatch
        ├── units.js          pt/pc/mm/cm/in → px at configurable DPI
        ├── warnings.js       Non-fatal warning collector
        ├── parsers/          IDML XML decoders
        │   ├── xml.js        fast-xml-parser wrapper
        │   ├── designmap.js  designmap.xml → manifest with paths
        │   ├── resources.js  Graphic.xml + Fonts.xml + Styles.xml
        │   ├── stories.js    Stories/Story_*.xml → text runs
        │   └── spreads.js    Spreads/*.xml + MasterSpreads/*.xml
        ├── pdf/              PDF reconstruction modules
        │   ├── pdfjs.js      Lazy pdfjs-dist loader (headless, extraction-only)
        │   ├── extract.js    Per-page: text runs, fonts, colors, images, vector flag
        │   ├── cluster.js    Glyph runs → lines → frames; column detection (pure)
        │   ├── classify.js   Font-size buckets → heading/body/caption styles (pure)
        │   ├── color.js      Re-exports the shared color helpers for the PDF path
        │   ├── png.js        Decoded pixels → PNG via node:zlib (pure)
        │   └── assets.js     Write extracted images to the asset cache
        ├── ingest/           Format-detecting front door
        │   ├── index.js      ingestBuffer/ingestSource → { format, ir, content }
        │   ├── detect.js     Byte sniffing (IDML zip vs %PDF-)
        │   └── content.js    IR → reading-ordered sections/outline/stats
        ├── map/              IR → neutral design tokens (token mapper)
        │   ├── index.js      mapTokens → { palette, fontSizes, fontFamilies,
        │   │                              spacingSizes, designTokens, report }
        │   ├── colors.js     Swatches → color palette (convert, dedupe, reuse base)
        │   ├── typography.js Paragraph styles → font-size scale + role classifier
        │   ├── spacing.js    Geometry + paragraph spacing → quantized spacing scale
        │   ├── fonts.js      Fonts → font families via config/font-map.json
        │   ├── design-tokens.js  DTCG / Style Dictionary emitter
        │   ├── report.js     Warnings + provenance aggregation
        │   └── slug.js       Namespaced slug helpers
        └── assets/           Image-byte staging
            ├── plan-assets.js  Deterministic staged filenames per image frame
            ├── idml-assets.js  IDML zip member → bytes resolver
            └── stage.js        resolveAssets/buildAssetBundle/runAssetStage
```

## Quick start

```js
import { parseIdml } from '@vespasian/pipeline';

const ir = await parseIdml('./brochure.idml', { dpi: 96 });

for (const warning of ir.warnings) {
  console.warn(`[${warning.code}] ${warning.message}`);
}
for (const swatch of ir.swatches) {
  console.log(swatch.name, swatch.color.hex);
}
```

Or from the command line:

```bash
node packages/pipeline/bin/parse-idml.mjs my-document.idml > ir.json
```

### PDF fallback

When you only have a PDF exported from InDesign, use the fallback parser. It
emits the same IR, plus fidelity warnings describing every approximation it made.

```js
import { parsePdf } from '@vespasian/pipeline';

const ir = await parsePdf('./brochure.pdf', {
  assetCacheDir: './assets',     // optional: write extracted images (PNG) here
  swatchPalette: idml?.swatches, // optional: snap detected colors to IDML swatches
});
```

```bash
node packages/pipeline/bin/parse-pdf.mjs brochure.pdf --asset-dir ./assets > ir.json
```

PDF reconstruction is lossy by design. See
[`docs/pipeline/indesign-pdf-fidelity.md`](../../docs/pipeline/indesign-pdf-fidelity.md)
for how each IR element is derived, the full list of fidelity-warning codes,
and the round-trip tolerances against IDML.

## Token mapper

Map a parsed IR (from either parser) into neutral design tokens. `mapTokens`
returns the complete `tokens.json` artifact: the four token groups (a bundled
neutral base token set merged by slug with the design-derived, namespaced
tokens), a DTCG / Style Dictionary `designTokens` interchange object, and a
report with provenance maps.

```js
import { parseIdml, mapTokens } from '@vespasian/pipeline';

const ir = await parseIdml('./brochure.idml');
const tokens = mapTokens(ir, {
  // base,        // base token set object/path (default: config/base-tokens.json)
  // fontMap,     // font map object/path (default: config/font-map.json)
  // namespace,   // derived-token slug prefix (default: 'id')
  // tolerance,   // color dedupe/reuse squared distance
  // gridPx,      // spacing grid (default: 4)
  // tolerancePx, // typography size clustering tolerance (default: 1)
  // fluid,       // emit fluid clamp() font sizes
});

tokens.palette;       // [{ slug, color: '#rrggbb', name }]
tokens.fontSizes;     // [{ slug, size: 'Nrem' | 'clamp(...)', name }]
tokens.fontFamilies;  // [{ slug, name, fontFamily: 'CSS stack' }]
tokens.spacingSizes;  // [{ slug, size: 'Nrem', name }]
tokens.designTokens;  // DTCG: { color: { slug: { $value, $type, $description } }, … }
tokens.report;        // warnings, fontFallbacks, outOfGamut, approximations,
                      // googleFonts (fonts to provision downstream), counts,
                      // provenance: { swatchToSlug, styleToSlug, fontToSlug }
```

The provenance maps are how a downstream driver resolves any IR style, swatch,
or font reference to a token slug — and every slug they mention resolves inside
the artifact itself, because the groups carry the base set too. The base token
set lives at [`config/base-tokens.json`](config/base-tokens.json): a small
neutral palette, system font stacks, a type scale, and an 8px spacing scale,
all in the same token-group shapes.

From the command line (composes with the parser CLIs, or parses directly):

```bash
node packages/pipeline/bin/parse-idml.mjs brochure.idml \
  | node packages/pipeline/bin/map-tokens.mjs --out-dir ./tokens > tokens.json

# or parse + map in one step
node packages/pipeline/bin/map-tokens.mjs brochure.idml --out-dir ./tokens
```

With `--out-dir` the CLI writes `tokens.json` (the full artifact),
`design-tokens.json` (just the DTCG object), and `report.json`.

## Asset staging

Resolve the document's image bytes (embedded in the IDML zip, or decoded from
the PDF) and stage them under deterministic filenames:

```bash
node packages/pipeline/bin/stage-assets.mjs brochure.idml --out-dir ./bundle
# → bundle/ir.json, bundle/assets/spread-N-image-K.ext, bundle/assets.manifest.json
```

`assets.manifest.json` records provenance only (frame id, href, staged path,
resolved flag, warnings) — never bytes. The staged names come from
`planAssets()` — one deterministic naming pass shared by the stage and any
consumer, so re-planning the same IR always resolves the same files. Frames
whose bytes can't be resolved are staged as `resolved: false` with an
`asset-unresolved` warning; the wix-driver's media phase uploads what's there
and reports the rest.

## Layout helper

`layoutSpread(frames)` turns one spread's flat frame list into reading-ordered
rows: side-by-side frames (≥50% vertical overlap) group into columns, and text
frames sitting mostly (≥60%) inside an image become that image's
`coverChildren` (text-over-image). Pure geometry, deterministic, and the basis
for mapping spreads onto Wix sections and column grids downstream.

```js
import { layoutSpread, classifyStyleRole } from '@vespasian/pipeline';

const rows = layoutSpread(ir.spreads[0].frames);
// [{ items: [{ frame, coverChildren: [...] }, …] }, …]

classifyStyleRole('Heading 2'); // { role: 'heading', level: 2 }
```

`classifyStyleRole` is the shared style-name → role classifier (heading levels,
body, caption) so every consumer binds InDesign styles to text roles the same
way.

## IR shape

The intermediate representation is described in [`src/indesign/ir.js`](src/indesign/ir.js). At the top level:

```js
{
  irVersion: 1,
  meta: { idmlVersion: '16.0', name: 'Brochure' },
  dpi: 96,
  swatches: [{ id, name, color: { hex, space, components } }],
  fonts: [{ id, family, style, postScriptName }],
  styles: [{ id, name, kind, fontSize, leading, tracking, fontRef, fillColorRef, properties }],
  stories: [{ id, source, runs: [{ text, paragraphStyleRef, characterStyleRef }] }],
  spreads: [{ id, source, pages, frames, appliedMasterRef }],
  masterSpreads: [{ id, source, name, pages, frames }],
  warnings: [{ code, message, context }],
}
```

Geometry (`Page.bounds`, `Frame.bounds`) is normalized to pixels at `dpi`
(default 96). Frames are a discriminated union (`kind: 'text'` or
`kind: 'image'`). The ingest stage adds an additive `content` sibling key (the
semantic content model: reading-ordered sections of heading/paragraph/figure
blocks, an outline, and stats) that the schema ignores, so the artifact still
round-trips through `Document.parse`.

## Failure mode

Both parsers share the same philosophy: throw only when the document can't be read at all; otherwise emit a partial IR with warnings.

- **IDML throws** on missing `designmap.xml`, a malformed zip, or a `<Spread>` lacking `Self`; **warns** on missing optional resources, dangling references, unknown color spaces, empty stories, unrecognized units.
- **PDF throws** only when the file can't be opened as a PDF; **warns** on every approximation (text reconstructed from glyphs, synthesized styles, dropped vector paths, undecodable images, …). PDF parses always carry fidelity warnings — that's expected.

Each CLI surfaces warnings on stderr and exits 0 unless the IR itself failed to build.

## Testing

```bash
pnpm --filter @vespasian/pipeline test
```

Tests build minimal fixtures programmatically — no binary fixtures in git. `tests/indesign/helpers/build-idml.js` emits IDML zips; `tests/indesign/helpers/build-pdf.js` emits PDFs (positioned text in base-14 fonts, FlateDecode image XObjects, vector fills). Building the *same logical document* both ways powers the IDML↔PDF round-trip test.

The PDF heuristics (clustering, classification, color, PNG encoding) are split into pure modules under `src/indesign/pdf/` and unit-tested without a PDF engine; only `extract.js` and the orchestrator touch pdfjs.

The layout module's row structure is covered by a snapshot test in `tests/indesign/layout.test.mjs`; snapshots live in `tests/indesign/__snapshots__/`. Re-record them after an intentional change with `UPDATE_SNAPSHOTS=1 node --test tests/indesign/layout.test.mjs`.

## Adding a new input format

When sub-issues for Figma / Canva migrations land, mirror the InDesign layout: a sibling directory under `src/`, its own IR schema, and a `parsers/` subdir for any input-format-specific decoders. The top-level `src/index.js` re-exports each surface so consumers `import { parseIdml, parseFigma } from '@vespasian/pipeline'`.
