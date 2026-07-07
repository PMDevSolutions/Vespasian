# Canva export fixture — `landing`

A small, representative **Canva HTML/CSS export** used by the Canva-to-Wix
integration test (`tests/canva-e2e/canva-pipeline.test.mjs`), the
`canva-wix` bats suites, and the `canva-pipeline` / `site-validation` CI
workflows.

This is **synthetic** (hand-authored to look like a Canva export), not a real
Canva download — so it can be committed and is stable across runs. It is shaped
to exercise the deterministic helper scripts the `canva-wix-converter` agent
path relies on:

| File | Exercises |
|------|-----------|
| `style.css` | `scripts/canva-wix/parse-canva-export.sh` — hex + `rgb()` colors, quoted `font-family`, `font-size` px, `padding`/`margin`/`gap` px → the neutral token shape (`palette`/`fontFamilies`/`fontSizes`/`spacingSizes`) |
| `index.html` | `scripts/canva-wix/convert-html-to-wix.sh` — headings, paragraphs, `<img>`, `<a class="button">`, `<ul>`, nested `<div>` → content-block JSON (`heading`/`paragraph`/`image`/`button`/`list`/`section` markers) |
| `images/hero.jpg` | 1×1 placeholder so image references resolve |

## Goldens

| File | What it is |
|------|-----------|
| `expected-tokens.json` | Committed output of `parse-canva-export.sh --tokens style.css` |
| `expected-blocks.json` | Committed output of `convert-html-to-wix.sh index.html` |

The integration test re-runs the real scripts against the inputs and compares
to these goldens, then feeds the tokens into the BuildPlan compiler
(`@vespasian/wix-driver`) and executes the plan with **dry-run transports** —
proving the whole fixture → tokens → plan → apply chain with zero Wix
credentials and zero network.

## Why goldens instead of a live conversion?

The Canva converter is an **LLM agent** (`.claude/agents/canva-wix-converter.md`):
the deterministic scripts above only extract tokens and rough content blocks;
the model does the editor-plane composition on the real site. An LLM can't run
reproducibly in CI, so the integration test guards the deterministic pieces and
the plan/apply machinery, and treats agent output as out of scope.

When the scripts change in a way that should change the goldens, regenerate:

```bash
bash scripts/canva-wix/parse-canva-export.sh --tokens tests/fixtures/canva/landing/style.css \
  > tests/fixtures/canva/landing/expected-tokens.json
bash scripts/canva-wix/convert-html-to-wix.sh tests/fixtures/canva/landing/index.html \
  > tests/fixtures/canva/landing/expected-blocks.json
```

and commit the diff alongside the script change.
