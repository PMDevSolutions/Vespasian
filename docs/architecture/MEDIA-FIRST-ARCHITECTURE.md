# Media-First Architecture

**Rule: every asset is uploaded through the Wix Media Manager API — and confirmed file-ready —
before any step references it.** No editor step, Velo snippet, or CMS item may point at an asset
that has not completed an API upload step.

This is Vespasian's structural successor to Flavian's "pattern-first" rule (which solved a
WordPress-specific problem — inline `src=""` in FSE templates). The Wix problem it solves is
different but rhymes: on Wix, **asset bytes and asset placement travel through different
channels** with different reliability characteristics.

## Why

| Fact | Consequence |
|---|---|
| Media upload is fully API-supported (`/site-media/v1/…`) | Bytes should always move over the reliable, headless channel |
| Element/image placement has **no API** — it's editor automation | Placement is the brittle step; never make it also responsible for uploading |
| Uploaded files are **not immediately usable** (async "file ready") | Every upload step must poll for readiness before anything references the file |
| The Media Manager picker is an iframe with proven selectors (`#mediaGalleryFrame`) | Picking a *pre-staged* asset is a deterministic flow; drag-uploading through the editor is not |

Splitting the operation — **bytes via API, placement via editor** — keeps the browser-automation
surface minimal and makes media failures cheap: an upload failure retries over HTTP; it never
strands a half-composed canvas.

## How it maps to the BuildPlan

The plan compiler (`packages/wix-driver/src/plan/`) enforces the ordering structurally:

1. Every asset in the IR becomes an **API upload step** in the executor's *media* phase
   (`packages/wix-driver/src/rest/` — generate-upload-url / import, then file-ready polling),
   with a deterministic `idempotencyKey` so re-applies don't re-upload.
2. Editor and data steps reference assets only by the **id of a completed media step**
   (`mediaRef`) — never by local path or external URL.
3. The executor (`packages/wix-driver/src/executor/`) runs the media phase (2) strictly before the
   editor phase (4); a media step that never reaches file-ready blocks its dependents with
   `skip-and-report` rather than letting the editor place a broken reference.
4. Placement then happens through the deterministic media-picker flow
   (`packages/wix-driver/src/editor/` — `frameLocator('#mediaGalleryFrame')`), a CMS image field
   (Data API), or a Velo `wix:image://v1/…` ref — all pointing at the already-staged file.

## Enforcement

- `scripts/wix-structure-validator/validate-structure.sh` rejects BuildPlans where an editor/data
  step references an asset without a corresponding media step (or out of phase order).
- The `wix-media-first-architecture` skill (`.claude/skills/wix-media-first-architecture/`)
  instructs agents: never hand-place unstaged assets in the editor.
- Fidelity: any placement that had to fall back (e.g. Velo `.src` because the picker flow failed)
  is recorded in the FidelityReport.

## Practical notes

- Web-optimize before upload (`scripts/assets/optimize-images.sh`) — print-resolution CMYK images
  from InDesign waste quota (`SITE_QUOTA_EXCEEDED` on free plans) and slow the published site.
- Prefer server-side **Import File** (public URL) over byte PUTs for pipeline assets; use the
  resumable upload for files > 10 MB.
- Organize uploads with `filePath`/labels per site slug so repeated runs stay tidy in the owner's
  Media Manager.

See also: [docs/wix/API-COVERAGE.md](../wix/API-COVERAGE.md) (the three media rows) and
[docs/wix/ARCHITECTURE.md](../wix/ARCHITECTURE.md#buildplan) (executor phases).
