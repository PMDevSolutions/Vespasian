# Wix Theming — how design tokens land on a Wix Studio site

The pipeline's token mapper (inherited from Flavian, unchanged) emits colors, typography, and
spacing tokens with full provenance. Wix has no design-token API, so the **translate stage**
(`packages/wix-driver/src/translate/`) compiles those tokens into the two channels Wix actually
offers:

1. a **ThemePlan** — the list of editor panel edits the Playwright plane performs
   (Site Styles → Colors / Typography), and
2. a **`global.css` artifact** — custom CSS shipped through the Wix CLI / Git integration
   (Studio's only fully headless styling channel).

Every token lands in **both** channels where possible: the theme panels are the source of truth
(what the site owner sees and can edit), and the CSS reinforces the rendered values. What cannot be
expressed is recorded in the **FidelityReport** — never silently dropped.

## Palette → theme slots

Wix themes expose a small, role-bound palette (Studio: 6 role-bound defaults, max 25 site colors;
classic: 9 slots), readable on the published site as `--wst-color-*` CSS variables — but **writable
only through the editor panel** (no theme write API).

The translator (`translate/palette.js`):

- compresses the extracted palette into the available theme slots and assigns **roles** (text
  primary, background, accents) inferred from usage in the IR;
- maps button styling onto the **18 `--wst-button-color-*` state tokens** rather than per-element
  overrides, so buttons follow the palette;
- sets **every shade explicitly** — Wix auto-generates shade gradients from a base color, and those
  auto-shades drift from the extracted values;
- records every compression decision (which source colors merged into which slot) in the
  FidelityReport.

**Verification:** after publish, QA scrapes the computed `--wst-color-*` variables from the live
page and asserts they match the ThemePlan.

## Type ramp → 9 slots + overflow classes

Wix has a **fixed 9-slot text theme**: H1–H6 plus Paragraph 1–3 (`--wst-font-style-*`). The
translator (`translate/typography.js`):

- clusters the extracted type scale and maps the nine most structurally important styles onto the
  nine slots (every text node in the IR is assigned a slot so styling stays token-driven);
- spills the overflow — display, caption, overline, eyebrow, and any additional steps — into
  **custom CSS classes** in `global.css`. These render correctly but are *invisible in the editor's
  typography panel*, which is recorded as a fidelity loss;
- pushes letter-spacing, text-transform, and anything beyond the panel's options into `global.css`
  as well.

## Fonts → match first, upload dialog second

There is **no font API** (Media Manager upload does not register fonts). The strategy:

1. **Match** extracted families against Wix's ~200+ built-in list (large Google Fonts coverage) —
   zero automation needed when it hits.
2. **Upload** unmatched families through the editor's "Upload Fonts" dialog (a deterministic
   Playwright flow): TTF/OTF/WOFF/WOFF2 accepted, **WOFF2 preferred, keep files < 4 MB**.
3. Variable-font axes are unsupported by Wix; exact font versions/subsets are lost — both recorded
   in the FidelityReport.

## Spacing → `--vsp-*` custom properties

Wix has **no spacing tokens anywhere** — no spacing tab in Site Styles, only per-element,
per-breakpoint pixel values. The extracted spacing scale therefore lives in `global.css`
(`translate/spacing.js` + `translate/css.js`):

```css
:root {
  --vsp-space-1: 0.25rem;
  --vsp-space-2: 0.5rem;
  --vsp-space-3: 1rem;
  /* … the mapped scale … */
}

.vsp-p-3 { padding: var(--vsp-space-3); }
.vsp-m-4 { margin: var(--vsp-space-4); }
```

The emitted utilities are `.vsp-p-<slug>` (padding) and `.vsp-m-<slug>` (margin) — one pair per
spacing step; directional variants (margin-top only, etc.) are set per element in the Studio
Inspector instead.

Utility classes (`.vsp-*` prefix) are attached to elements via the Studio **CSS Classes** panel
(Playwright) or Velo `customClassList` at runtime. Structural gaps that must be literal (section
grid gutters, per-breakpoint offsets) are set in the Studio Inspector by the editor plane.

This emulation is **Studio-only**: classic Editor has no custom CSS at all, which is one reason
Vespasian targets Studio exclusively in v1.

## What's lost → FidelityReport

Wix cannot express everything a design system produces. Instead of a false "pixel-perfect"
promise, every `vespasian apply` emits a **FidelityReport** recording each translation loss:

| Loss | Why |
|---|---|
| Palette compression into theme slots | more source colors than slots; role inference |
| Type styles spilled into custom CSS classes | fixed 9-slot ramp; overflow invisible to the editor's theme UI |
| Spacing scale living only in `global.css` | no spacing tokens in Wix |
| Layout translated from absolute coordinates to section/grid intent | no layout composition API; grid semantics differ |
| Font substitutions / lost variable axes | no font API; platform limits |
| Any step that fell back from API to editor automation | channel downgrade is a fidelity-relevant event |

QA closes the loop: post-publish screenshots at the three Studio breakpoints
(1001+ / 751–1000 / 320–750) are pixel-diffed against the design renders
(`scripts/visual-diff.js`, `scripts/check-responsive.sh`), and computed-style assertions verify the
theme tokens actually applied.

## See also

- [ARCHITECTURE.md](ARCHITECTURE.md) — the full output-layer architecture
- [API-COVERAGE.md](API-COVERAGE.md) — per-operation channel routing (incl. the theme-panel rows)
- [editor-automation.md](editor-automation.md) — how the panel flows are driven
- `.claude/skills/wix-site-development/` — site-building conventions for agents
