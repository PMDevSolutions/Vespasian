# Figma to Wix — BuildPlan examples

Reference snippets for the converter and builder agents (`figma-wix-converter`,
`wix-site-builder`). These show the *shape* of good plan output for common design constructs —
the Vespasian analog of block-markup examples in the WordPress sibling. Schema:
`packages/wix-driver/src/plan/`.

## A BuildPlan skeleton

```json
{
  "version": 1,
  "site": { "name": "acme-landing", "templateId": "<confirmed-studio-template-guid>" },
  "steps": [
    { "id": "provision-1", "op": "site.createFromTemplate", "method": "api", "...": "…" },
    { "id": "media-1", "op": "media.import", "method": "api", "...": "…" },
    { "id": "editor-pages-1", "op": "pages.create", "method": "playwright", "...": "…" },
    { "id": "editor-canvas-1", "op": "canvas.composeSection", "method": "agent", "...": "…" },
    { "id": "code-1", "op": "css.pushGlobal", "method": "cli", "...": "…" },
    { "id": "publish-1", "op": "site.publish", "method": "api", "...": "…" }
  ]
}
```

Steps execute in executor phase order (provision → media → data → editor → code →
properties/embeds → publish → QA), not raw array order; ids must be unique and stable so
`--resume-from` and idempotent re-runs work.

## API step — provision from template, assert Studio

```json
{
  "id": "provision-1",
  "op": "site.createFromTemplate",
  "method": "api",
  "input": {
    "endpoint": "POST /funnel/projects/v1/create",
    "body": { "type": "WIX", "templateId": "<guid>", "name": "acme-landing" }
  },
  "idempotencyKey": "provision:acme-landing",
  "verify": { "editorType": "WIX_STUDIO" },
  "onFail": "escalate"
}
```

`verify.editorType` triggers a Get Editor URLs read-back — the plan **fails fast** if the template
did not yield a Studio site.

## API step — media upload with file-ready poll

```json
{
  "id": "media-hero",
  "op": "media.import",
  "method": "api",
  "input": {
    "endpoint": "POST /site-media/v1/files/import",
    "displayName": "hero.png",
    "filePath": "/vespasian/acme-landing/hero.png",
    "sourcePath": ".vespasian/assets/acme-landing/hero.png"
  },
  "idempotencyKey": "media:acme-landing:hero.png",
  "verify": { "poll": "fileReady", "timeoutMs": 60000 },
  "onFail": "retry"
}
```

Media steps always precede any editor step that references the asset
(media-first architecture). `verify.poll: "fileReady"` is mandatory — files are not usable
immediately after upload.

## Playwright step — theme palette panel

```json
{
  "id": "theme-colors",
  "op": "theme.applyColors",
  "method": "playwright",
  "input": {
    "flow": "themeColors",
    "slots": {
      "main-1": "#1A1A2E", "main-2": "#FFFFFF",
      "shade-1": "#4A4A68", "shade-2": "#8888A6", "shade-3": "#D6D6E4",
      "accent-1": "#E94560", "accent-2": "#0F3460", "accent-3": "#16213E", "accent-4": "#53BF9D"
    }
  },
  "idempotencyKey": "theme:colors:acme-landing",
  "verify": { "publishedCssVars": { "--wst-color-accent-1": "#E94560" } },
  "onFail": "escalate"
}
```

Every shade is explicit — never let Wix auto-generate the gradient. Verification scrapes the
computed `--wst-*` variables from preview/published output.

## Agent step — canvas section composition

```json
{
  "id": "canvas-hero",
  "op": "canvas.composeSection",
  "method": "agent",
  "input": {
    "page": "home",
    "position": 0,
    "intent": {
      "kind": "hero",
      "grid": { "columns": "1fr 1fr", "minHeight": "80vh" },
      "children": [
        { "kind": "heading", "slot": "H1", "text": "Build faster" },
        { "kind": "paragraph", "slot": "P2", "text": "Acme ships your ideas." },
        { "kind": "button", "role": "primary", "text": "Get started", "link": "/contact" },
        { "kind": "image", "mediaRef": "media-hero", "alt": "Product screenshot" }
      ]
    },
    "selectorHints": { "addPanel": "[data-hook='add-panel']" }
  },
  "idempotencyKey": "canvas:home:hero",
  "verify": { "layersTree": ["hero", "heading", "button", "image"] },
  "onFail": "escalate"
}
```

Agent steps carry **intent, not coordinates**: the design's absolute layout is translated into
section/grid intent, and the `wix-site-builder` agent executes it visually via the Playwright MCP.
`selectorHints` are hints — the agent verifies against the Layers tree, never trusts a click.
Text always references a **theme slot** (`H1`–`H6`, `P1`–`P3`); buttons reference theme roles;
images reference the id of a completed media step (`mediaRef`).

## CLI step — global.css push

```json
{
  "id": "css-global",
  "op": "css.pushGlobal",
  "method": "cli",
  "input": { "file": "src/styles/global.css", "source": ".vespasian/plans/acme-landing.global.css" },
  "idempotencyKey": "css:acme-landing",
  "verify": { "publishedCssVars": { "--vsp-space-3": "1rem" } },
  "onFail": "retry"
}
```

The generated `global.css` carries the spacing scale and typography overflow:

```css
:root {
  --vsp-space-1: 0.25rem;
  --vsp-space-2: 0.5rem;
  --vsp-space-3: 1rem;
  --vsp-space-4: 2rem;
}

/* type-ramp overflow — styles that didn't fit the 9 theme slots */
.vsp-type-display { font: 700 4.5rem/1.05 var(--vsp-font-heading, inherit); }
.vsp-type-overline { font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; }

.vsp-p-3 { padding: var(--vsp-space-3); }
```

CLI steps are sequenced **after** the editor phase — page code files cannot exist before the pages
do.

## Anti-patterns

| Don't | Do |
| --- | --- |
| Literal hex on an element (`"color": "#E94560"`) | Reference a theme slot or `--vsp-*`/`--wst-*` variable |
| Reference an asset by local path in an editor step | Reference the `mediaRef` of a completed API upload step |
| Pixel coordinates in canvas intent | Section/grid intent (`columns`, `minHeight`, order) |
| `method: "playwright"` for anything with an API row in [API-COVERAGE](../wix/API-COVERAGE.md) | Use the API channel |
| Trusting a click succeeded | A `verify` clause on every step |
