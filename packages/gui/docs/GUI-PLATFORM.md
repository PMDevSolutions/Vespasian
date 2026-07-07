# GUI platform — from "the Vespasian app" to a shared engine (Trajan)

`@vespasian/gui` began life as **Flavian**'s desktop shell (hard-wired to drive the
WordPress toolchain) and was forked into Vespasian through the manifest seam described
here — the fork swapped one ProductManifest (plus the bespoke per-screen panels) and
kept the engine. We are evolving that engine into a generic shell that renders **any
PMDS framework** (Vespasian, Aurelius, Nerva, Flavian, …) from a typed descriptor. The
unified app that ships all of them is **Trajan**.

This doc is a pointer for that work, not a spec. It describes the three-layer
architecture the codebase now follows and the staged plan it serves.

## Three layers

1. **Shared engine** — generic machinery that knows nothing about any product:
   the task model (`src/core/task`), process running (`src/core/process`,
   `src/core/shell`), the IPC handlers (`src/main/ipc`), the React shell + reusable
   components/hooks (`src/renderer`), and the manifest interpreters
   (`src/core/product/command-spec.ts`, `src/core/product/parsers.ts`). A new product
   does not change this layer.

2. **Per-product manifest** — one pure-data `ProductManifest`
   (`src/shared/product/manifest.ts`) that declares **what a product exposes**:
   identity, project-detection markers, and the screens → steps → (command, parser,
   prerequisites) catalog. The Vespasian manifest is `src/shared/product/vespasian.ts`.
   It speaks the engine's existing vocabulary — `TaskKind`, `SiteCommand`,
   `QaScript`, `PipelineKind` — rather than inventing new terms, and
   is node-free + serializable so the sandboxed renderer, main, and preload can all
   import it. The active product is chosen in `src/shared/product/index.ts`
   (`activeManifest`); main injects it into `registerHandlers`, and the renderer shell
   reads its brand + nav from it.

3. **Per-product specifics** — the bespoke React panels
   (`src/renderer/components/*Panel.tsx`). Each is a custom UI for one screen; it now
   reads its *step catalog* (which commands/kinds/themes exist, their labels) from the
   manifest, while keeping its product-specific layout. As the platform matures, more
   of each panel's surface migrates up into the manifest.

The dependency rule: layer 1 reads layer 2; layer 2 is data; layer 3 reads layer 2.
Nothing in layers 1/3 hard-codes a product's scripts, screens, or identity.

## Adding a product (the extension point)

A second product is *only another manifest* — no engine/core/renderer change:

1. author `src/shared/product/<product>.ts` (another `ProductManifest`);
2. register it in `src/shared/product/index.ts` → `PRODUCTS`;
3. point `ACTIVE_PRODUCT_ID` at it (or, under Trajan, select per-product at runtime).

A typed scaffold for this is `src/shared/product/aurelius.ts` — intentionally **not**
wired in yet.

## Staged plan

1. **Ship Flavian** — the original hard-wired desktop app. ✅ (through Flavian v1.10.0)
2. **Manifest seam** — extract the implicit catalog into an explicit
   `ProductManifest`; make the engine render from it with zero behaviour change. ✅
3. **Prove reuse by forking (Vespasian)** — this repo: a Wix-retargeted manifest
   (site screen instead of a Docker screen), a `core/wix` status module, and rewritten
   bespoke panels, on the same engine. ◀ **you are here.**
4. **Extract the engine** — split the generic layer out so products can be packaged
   independently of any one of them.
5. **Add Aurelius / Nerva** — further manifests, validating the engine across products.
6. **Ship Trajan** — one app that selects a product at runtime and renders any of them.

## Scope notes

- **Panel presentation prose** — explanatory copy in the panels (e.g. "runs
  `bin/vespasian.mjs`") still lives in the components. The *operational* catalog
  (scripts, commands, parsers, markers, links, chooser copy) is in the manifest; the
  remaining prose is presentation and will follow.
- **Bridge / IPC namespace** — the fork renamed the bridge to `window.vespasian` and
  the IPC channels to `vespasian:*`. Trajan will keep a single product-neutral bridge,
  so a future rename to a neutral namespace remains on the table.
- **Build identity** — the package name (`@vespasian/gui`), window title, appId and
  installer name say "Vespasian". These identify *this build*, analogous to
  `ACTIVE_PRODUCT_ID`, and change when Trajan packaging lands.
- **Interactive terminal steps** — `vespasian login --editor` (consent prompt + headed
  login) needs a real TTY, so the site panel points at the terminal command instead of
  spawning it. The `PtyRunner` stub in `core/process` is the reserved seam for running
  interactive sessions in-app later.

## Map

| Concern | File |
| --- | --- |
| Manifest type | `src/shared/product/manifest.ts` |
| Vespasian manifest | `src/shared/product/vespasian.ts` |
| Registry + active product + selectors | `src/shared/product/index.ts` |
| Aurelius scaffold (extension point) | `src/shared/product/aurelius.ts` |
| Command interpreter | `src/core/product/command-spec.ts` |
| Output-parser registry | `src/core/product/parsers.ts` |
| Manifest injection point | `src/main/index.ts`, `src/main/ipc/register-handlers.ts` |
| Shell reads brand + nav | `src/renderer/App.tsx` |
