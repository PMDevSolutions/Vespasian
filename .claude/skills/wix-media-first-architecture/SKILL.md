---
name: wix-media-first-architecture
description: Enforces media-first architecture for Wix builds - every asset is uploaded to the Wix Media Manager via API and confirmed file-ready BEFORE any page composition references it. Never hand-place unstaged assets through the editor. Auto-applies whenever a plan or editor step touches images, video, or fonts. Keywords: Wix media, media manager, wix:image, file-ready, upload before placement, staged assets
---

# Wix Media-First Architecture

## The Iron Law

**Every asset is uploaded through the Media API and confirmed file-ready BEFORE any step references it. No exceptions.**

```
WRONG:  compose section → drag a local file into the editor → hope
RIGHT:  media phase (API upload → poll file-ready → record wix media ref)
        → editor phase places the ALREADY-STAGED asset by reference
```

This is Vespasian's analog of Flavian's pattern-first rule. The WordPress failure mode was `src=""` in HTML templates; the Wix failure modes are:

1. **Local/relative paths do not exist on Wix.** A content block referencing `assets/hero.jpg` renders nothing — Wix only serves media from its Media Manager (`static.wixstatic.com`, `wix:image://` refs).
2. **Media is not usable the instant the upload call returns.** Files go through processing; referencing a file before the **file-ready** state yields broken images or failed picker lookups. Poll first.
3. **Hand-dragging files through the editor is the most brittle automation surface there is** — an upload dialog inside the (iframed) media manager, per file. The API upload is one deterministic REST call.

## When to Use

Auto-applies when:
- A BuildPlan contains image/video/document blocks
- Composing editor sections that include media
- Uploading fonts (the one media type WITHOUT an API — see below)
- Debugging broken images on an applied site

**Trigger phrases:** "images broken on the Wix site", "upload media", "place this image", "media manager"

## The Correct Flow

### 1. Manifest (pipeline)

Every asset enters `assets.manifest.json` with a **semantic slug** (from the mandatory asset semantic-mapping step — never hash filenames):

```json
{
  "assets": [
    {
      "slug": "hero-group-photo",
      "path": "assets/hero-group-photo.jpg",
      "mimeType": "image/jpeg",
      "alt": "Team members in front of the office"
    }
  ]
}
```

### 2. Media phase (API — `method: "api"`, phase `media`)

For each asset, the executor:
1. Uploads via the Site Media REST API (import/upload URL flow) with `wix-site-id` targeting
2. **Polls until file-ready** (`verify: { "assert": "fileReady" }` in the plan step)
3. Records the returned media reference (media ID / `wix:image://v1/...` URI) against the slug in the run state

Recipes for the raw calls live in `wix-cli-workflows`.

### 3. Placement (editor phase — after media is staged)

- Content blocks reference `assetSlug`, the executor resolves slug → staged media ref.
- Deterministic picker flow: the media manager opens in an **iframe** (`#mediaGalleryFrame`); select the already-uploaded file via `[data-hook="gallery-file"]` + `[data-hook="select-items"]` — selectors are hints, probe first (see `wix-playwright-driver`).
- Agent-visual composition: the wix-site-builder agent picks the staged asset from "Site files" — it never uses the editor's upload button.

### 4. Optimization (before staging, not after)

Print/design exports are routinely oversized. Before the media phase:

```bash
./scripts/assets/optimize-images.sh <asset-dir>   # resize, recompress, CMYK→sRGB
```

Targets: web-appropriate dimensions (≤ 2560px wide for full-bleed), sRGB, sensible compression. The bundle-guard hook flags plans that smell like embedded asset bytes (> 2MB plan JSON) — plans reference staged media, they never embed it.

## Fonts — the one exception that proves the rule

There is **no font-upload API**. Custom fonts (WOFF2 preferred, **< 4 MB**) go through the editor's font-upload dialog — a deterministic Playwright flow, and the ONLY sanctioned "upload through the editor" in the whole system. The translate stage first tries to avoid it entirely by matching against Wix builtin fonts (`packages/wix-driver/src/translate/wix-builtin-fonts.json`); a builtin substitution is a FidelityNote, an upload is an editor-channel plan step.

## Validation

```bash
# Plan-level: every image block's assetSlug resolves to a manifest entry
jq -r '[.steps[] | select(.phase=="editor") | .input | .. | .assetSlug? // empty] | unique' \
  .vespasian/plans/<slug>/plan.json
jq -r '[.assets[].slug] | unique' .vespasian/plans/<slug>/assets.manifest.json
# → first list must be a subset of the second

# No local file paths leaked into editor-phase inputs
jq '[.steps[] | select(.phase=="editor") | .input | .. | strings
     | select(test("\\.(png|jpe?g|svg|webp|gif)$"))] | length' \
  .vespasian/plans/<slug>/plan.json
# → 0 (editor steps reference slugs/media refs, never file paths)

# Live-site check: no broken images
# (visual-qa-verification Step 3: DevTools/network 404 audit on the published URL)
```

The `figma-wix-post-page.sh` hook and `scripts/wix-structure-validator/validate-structure.sh` run these shapes of checks warn-only during conversion.

## Common Mistakes & Rationalizations

### "I'll just have the agent drag the file in — it's one image"
One image today, twelve tomorrow, and every drag is an iframe upload dialog that breaks when Wix ships. The API upload is a single deterministic call. Stage it.

### "Upload returned 200, so I can place it now"
200 means accepted, not ready. Skip the file-ready poll and the picker won't find the file, or the placed image renders broken. Always poll.

### "I'll reference the image by its static.wixstatic.com URL from another site"
Cross-site hotlinks bypass the manifest, break when the source site changes, and dodge alt-text discipline. Assets go through THIS site's Media Manager.

### "The alt text can come later"
Alt text enters the manifest at semantic-mapping time, when you actually looked at the image. "Later" means never and an accessibility finding in QA.

## Integration

- **Pipelines:** the media phase is compiled by `packages/wix-driver/src/plan` and executed by `src/executor` (phase 2, before data/editor/code)
- **Skills:** `figma-to-wix-autonomous-workflow` / `canva-to-wix-autonomous-workflow` (semantic mapping feeds the manifest), `wix-cli-workflows` (raw media API recipes), `wix-playwright-driver` (picker flow), `visual-qa-verification` (broken-image audit)
- **Agents:** `asset-cataloger` (manifest hygiene), `wix-site-builder` (placement)

---

**Skill Version:** 1.0.0 (replaces fse-pattern-first-architecture)
**Last Updated:** 2026-07-06
