---
name: visual-qa-verification
description: Use after a design-to-Wix conversion to verify the live site matches the source design. Covers screenshot comparison at Studio breakpoints, responsive checks, Lighthouse audits, media rendering, accessibility validation, and the FidelityReport. Keywords: verify site, visual QA, compare to Figma, check screenshots, responsive test, post-conversion verification, FidelityReport
---

# Visual QA Verification

## Overview

After Vespasian applies a BuildPlan to a Wix site, this skill guides verification that the **live site** matches the source design (Figma frame, rendered Canva export, or InDesign spread). It covers screenshot comparison, responsive behavior, accessibility, performance, and media rendering.

**Core Principle:** every conversion is visually verified on the live/preview URL before delivery. The figma-wix-completion hook validates plan structure and token discipline; this skill validates what the user actually sees. Differences that Wix cannot express are not failures — they are **FidelityReport entries**; differences Wix *can* express are bugs to fix.

## When to Use

Use this skill when:
- A design-to-Wix conversion has just been applied/published
- Verifying a Wix site against its design source
- Running post-conversion visual QA or responsive checks
- Validating that all media renders correctly

**Symptoms that trigger this skill:** "verify the site" · "visual QA" · "compare to Figma" · "check screenshots" · "does it match the design" · "responsive check"

## Verification Checklist

Run these checks in order after `vespasian apply` completes.

### Step 1: Resolve the URL to Test

```bash
# Preferred: publish, then test the public URL
vespasian publish

# Or test pre-publish via the preview URL:
curl -s "https://www.wixapis.com/editor-urls/v2/editor-urls" \
  -H "Authorization: $WIX_API_KEY" -H "wix-site-id: $WIX_SITE_ID" | jq -r '.urls.previewUrl'
```

`vespasian qa` automates Steps 2, 6 and the FidelityReport; the manual loop below is for fixing what it finds.

### Step 2: Screenshot Comparison

Screenshot at the Wix Studio breakpoints and compare against the design baselines captured during Phase 1.

**Breakpoints to test:**

| Breakpoint | Test width | Studio range |
|------------|-----------|--------------|
| Mobile | 375px | 320–750px |
| Tablet | 900px | 751–1000px |
| Desktop | 1280px | 1001px+ |
| Design canvas | 1440px | sanity check vs the source frame width |

**Using Playwright MCP:**

```
1. mcp__playwright__browser_navigate → the published/preview URL
2. mcp__playwright__browser_resize → each breakpoint, then browser_take_screenshot (fullPage)
3. Compare against the design baseline (figma MCP get_image / rendered Canva export / spread render)
4. Pixel-diff where useful: ./scripts/visual-diff.js <actual> <expected>
```

**What to compare:**
- Section order and structure (grids, columns, alignment)
- Typography (text-theme roles applied — not editor defaults)
- Color accuracy (theme slots, backgrounds, buttons)
- Whitespace rhythm (`--vsp-space-*` taking effect)
- Full-bleed sections actually reaching the viewport edges

### Step 3: Media Rendering

Verify all media loads. This catches media-first architecture violations.

- **In browser:** DevTools Network tab (or `mcp__playwright__browser_navigate` + console/network read), filter images, reload. Any 404 or `about:blank` src = a step referenced unstaged media.
- **All images serve from `static.wixstatic.com`** — an image loading from anywhere else bypassed the Media Manager (see `wix-media-first-architecture`).
- Spot-check alt text is present (from the asset manifest), not empty.

### Step 4: Responsive Behavior

**Check for:**
- Navigation collapses to the mobile menu
- Multi-column grids stack on mobile
- Images scale (no overflow, no letterboxing surprises)
- Text readable at all sizes; touch targets ≥ 44×44px on mobile
- No horizontal scrollbar at any breakpoint

**Common failures after conversion:**
- Grid columns that don't stack (section grid behavior not set per breakpoint)
- Absolutely-translated elements overlapping at tablet width
- `.vsp-text-*` overflow styles missing a mobile size

### Step 5: Lighthouse Audit

**Target scores:**

| Category | Minimum | Target |
|----------|---------|--------|
| Performance | 70 | 85+ |
| Accessibility | 90 | 100 |
| Best Practices | 90 | 100 |
| SEO | 90 | 100 |

```bash
pnpm lighthouse:run    # lhci autorun against lighthouserc.json (point it at the published URL)
```

Note: Wix's own runtime sets the performance floor — treat large deltas from a blank Wix site as your problem, absolute scores as partly the platform's. Common fixable issues: unoptimized staged images, missing alt text, missing per-page meta (the SEO panel step).

### Step 6: Accessibility Checks

Beyond Lighthouse, manually verify:

- **Keyboard navigation:** tab through — every interactive element reachable
- **Focus indicators** visible
- **Heading hierarchy:** h1 → h2 → h3, no skips (check the text-theme role assignments)
- **Color contrast:** WCAG AA (4.5:1 normal, 3:1 large) — palette compression into theme slots can shift contrast; re-check, don't assume the source design's ratios survived
- **Landmarks:** header, nav, main, footer present in the rendered DOM

### Step 7: Design Token Verification

Confirm styling flows through the token system, not per-element overrides.

```bash
# Structural audit (plan + global.css):
bash .claude/hooks/figma-wix-completion.sh .vespasian/plans/<slug>/plan.json
```

**Verify on the live site:** `vespasian qa` asserts computed styles against the expected `--vsp-*` variables. Manual spot check: change a spacing token → re-run translate/apply for the code phase → the affected sections shift together. If only one element moves, it was styled inline.

## Common Failures

### 1. Fonts Don't Match
**Cause:** builtin-font substitution (no font-upload API used) or the upload step escalated.
**Fix:** check the FidelityReport for the substitution; if a real WOFF2 is available (< 4 MB), run the font-upload editor flow and re-verify.

### 2. Colors Are Close But Not Exact
**Cause:** palette compression into Studio theme slots, or Wix auto-derived shades.
**Fix:** confirm the translate stage set shades explicitly; if the slot count forced compression, it must be in the FidelityReport — if the exact color exists in tokens but not on the site, the theme-panel flow failed: re-run it.

### 3. Spacing Feels Wrong
**Cause:** `global.css` not pushed (code phase ordered before pages existed, or CLI channel unavailable).
**Fix:** verify `src/styles/global.css` reached the site (computed `--vsp-space-*` values in DevTools); re-run the code phase: `vespasian apply <plan> --resume-from code`.

### 4. Images Missing or Broken
**Cause:** media referenced before file-ready, or a local path leaked into an editor step.
**Fix:** re-run the media phase, confirm file-ready, re-place. See `wix-media-first-architecture`.

### 5. Section Layout Diverges at Tablet
**Cause:** desktop-first grid without per-breakpoint behavior.
**Fix:** wix-site-builder editor pass on the section's grid settings for the 751–1000px range.

## Integration with This Template

- **figma-wix-converter / canva-wix-converter / indesign-to-wix agents** — produce what this skill verifies
- **wix-site-builder agent** — executes visual fixes in the editor
- **visual-qa-agent** — screenshots the LIVE Wix site vs the source design
- **accessibility-auditor agent** — deep a11y pass
- **figma-wix-completion.sh hook** — structural/token validation (complements this visual pass)
- **Playwright MCP** — screenshots and responsive testing · **figma MCP** — source baselines
- **`vespasian qa`** — the automated core of this checklist + FidelityReport emission

## Verification Report Template

```markdown
# Visual QA Report: [site-name]

**Date:** YYYY-MM-DD
**Design source:** [Figma URL / export path]
**Wix URL:** [published or preview URL]

## Results

| Check | Status | Notes |
|-------|--------|-------|
| Desktop match (1280) | PASS/FAIL | |
| Tablet match (900) | PASS/FAIL | |
| Mobile match (375) | PASS/FAIL | |
| Media renders | PASS/FAIL | |
| Responsive | PASS/FAIL | |
| Lighthouse Perf | XX/100 | |
| Lighthouse A11y | XX/100 | |
| Keyboard nav | PASS/FAIL | |
| Token-only styling | PASS/FAIL | |

## FidelityReport deltas (expected, not failures)
1. ...

## Issues Found (must fix)
1. ...

## Recommendation
[ ] Ready for delivery
[ ] Needs fixes (see issues above)
```

---

**Skill Version:** 2.0.0 (live Wix site vs source design)
**Last Updated:** 2026-07-06
