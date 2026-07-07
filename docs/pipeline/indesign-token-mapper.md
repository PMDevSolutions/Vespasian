# InDesign token mapper: guide

The token mapper is stage 3 of the InDesign-to-Wix pipeline. It takes the
[intermediate representation](../../packages/pipeline/src/indesign/ir.js)
produced by the [IDML parser](../../packages/pipeline/README.md) or the
[PDF fallback parser](indesign-pdf-fidelity.md) and maps it to a neutral
design-token document, so the downstream Wix translate stage inherits a coherent
design system instead of inline magic numbers.

It produces two artifacts:

| Artifact | What it is |
| --- | --- |
| `design-tokens.json` | DTCG (Design Tokens Community Group) tokens — colors, type scale, font families, spacing — read natively by Style Dictionary v4 and consumed by `packages/wix-driver/src/translate/`. |
| report | Warnings, validation result, provenance maps, font fallbacks, Google fonts. |

The tokens are deliberately **platform-neutral**: the Wix-specific compression
(palette → theme slots, ramp → the 9 text slots, spacing → `--vsp-*` custom
properties) happens later, in the translate stage — see
[docs/wix/theming.md](../wix/theming.md).

## Usage

```js
import { parseIdml, mapTokens } from '@vespasian/pipeline';

const ir = await parseIdml('./brochure.idml');
const { designTokens, report } = mapTokens(ir);
```

```bash
# Compose with a parser CLI…
node packages/pipeline/bin/parse-idml.mjs brochure.idml \
  | node packages/pipeline/bin/map-tokens.mjs --out-dir ./tokens

# …or parse + map in one step (accepts .idml or .pdf directly).
node packages/pipeline/bin/map-tokens.mjs brochure.pdf --out-dir ./tokens
```

### Options

| Option | CLI flag | Default | Effect |
| --- | --- | --- | --- |
| `fontMap` | `--font-map <path>` | bundled `config/font-map.json` | Font fallback table. |
| `namespace` | `--namespace <str>` | `id` | Prefix for derived token slugs. |
| `tolerance` | `--tolerance <n>` | `1728` (≈24/channel) | Color dedupe/reuse squared-RGB distance. |
| `gridPx` | `--grid <px>` | `4` | Spacing quantization grid. |
| `tolerancePx` | `--type-tolerance <px>` | `1` | Font-size clustering tolerance. |
| `fluid` | `--fluid` | off | Emit fluid `clamp()` font sizes. |

Run `node packages/pipeline/bin/map-tokens.mjs --help` for the authoritative list.

## How mapping works

| Token group | How it's derived |
| --- | --- |
| Color tokens | Each swatch is re-derived to sRGB from its raw `components` (better than the parser's preview hex for LAB). Colors within `tolerance` of each other are deduped by hex; each is emitted as a namespaced `id-*` token with provenance back to the source swatch. |
| Type-scale tokens | Paragraph-style font sizes are clustered (near-equal sizes merge). Each cluster becomes a token named after the InDesign style. Every emitted entry is referenced by ≥1 paragraph style. |
| Font-family tokens | Fonts are mapped through `config/font-map.json`. Unmapped families fall back to a heuristic generic and raise a warning. |
| Spacing tokens | Candidate spacings (page margins, inter-frame gutters, paragraph space-before/after) are quantized to `gridPx`, deduped, and capped. |
| Role hints | Recognized style names (Heading N / Body / Caption) carry role metadata so the translate stage can assign them to Wix theme slots (H1–H6, P1–P3). |

## Color conversion math

The mapper re-derives every swatch from its raw `components` using documented
math (shared module: [`src/indesign/color.js`](../../packages/pipeline/src/indesign/color.js)).
For RGB and CMYK the result equals the parser's preview hex; for LAB it is a real
color rather than the parser's legacy black.

- **RGB** (0–255): formatted directly to `#rrggbb`.
- **CMYK** (0–100): naive, profile-free conversion
  `r = 255·(1 − c/100)·(1 − k/100)` (and likewise for g, b). Without an ICC
  profile this is an approximation and never clips, so no out-of-gamut signal is
  reported for CMYK — this is documented, not faked.
- **LAB** (L 0–100, a/b −128–127): full colorimetric path —
  CIELAB → XYZ using a **D50** reference white
  (`Xn 0.96422, Yn 1.0, Zn 0.82521`, with `ε = 216/24389`, `κ = 24389/27`) →
  linear sRGB via the Bradford-adapted XYZ(D50)→sRGB matrix (D50→D65 folded in)
  → sRGB gamma → 8-bit. If any linear channel falls outside `[0, 1]` (beyond a
  small tolerance) before clamping, the color is **out of gamut** and a warning
  is emitted; the clamped color is used.

## Font map format

`config/font-map.json` maps an InDesign family name to a CSS stack:

```json
{
  "Merriweather": {
    "fontFamily": "Merriweather, Georgia, serif",
    "source": "google",
    "googleFontName": "Merriweather",
    "fallback": "serif"
  }
}
```

`source: "google"` families are collected in the report's `googleFonts` so the
translate stage can match them against Wix's built-in font list (large Google
Fonts coverage) instead of planning an upload. Unmapped families fall back to a
heuristic generic (`serif` / `sans-serif` / `monospace`) inferred from the
family name; genuinely custom fonts are queued for the editor's upload dialog
(WOFF2 preferred, < 4 MB).

## Warning codes

| Code | Meaning |
| --- | --- |
| `color-out-of-gamut` | A LAB swatch fell outside the sRGB gamut and was clamped. |
| `swatch-approximated` | A Spot/Unknown swatch has no numeric conversion; the hex is an approximation. |
| `font-fallback` | A font isn't in the map; a heuristic generic family was used. |
| `spacing-approximate` | The spacing scale was derived from approximate (PDF) geometry. |

The report merges these with the IR's own parse-time warnings; the translate
stage later folds them into the run's FidelityReport.

## Validation

The emitted token document is validated with a zod schema (token fixtures for
tests live at `tests/fixtures/.../minimal-tokens.json` /
`invalid-tokens.json`). Provenance is total: `report.provenance.styleToSlug`
records which source style produced which token, so every downstream Wix value
can be traced back to the InDesign document.

## Known limitations

- **CMYK is profile-free.** Without an ICC profile, CMYK→sRGB is an approximation.
- **Spacing is approximate**, especially from PDF geometry (whole-page margins can
  be large when frames don't fill the page); values are quantized and capped.
- **Role coverage** is limited to recognized style names (Heading N / Body /
  Caption); other styles still contribute size and color tokens but carry no
  role hint for slot assignment.
- Wix-side constraints (slot counts, no spacing tokens) are **not** applied
  here — they belong to the translate stage and are reported in the
  FidelityReport.
