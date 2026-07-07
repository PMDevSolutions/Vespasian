---
name: figma-to-wix-autonomous-workflow
description: Use when converting Figma designs into a live Wix Studio site. Orchestrates the autonomous workflow from design token extraction through BuildPlan compilation, apply (API-first, editor automation as fallback), visual QA, and FidelityReport. Keywords: Figma to Wix, Wix conversion, design tokens, BuildPlan, autonomous site generation, Wix Studio
---

# Figma-to-Wix Autonomous Workflow

## Overview

This skill orchestrates the complete autonomous conversion of Figma designs into a **live Wix Studio site**. It bridges Figma design systems with Vespasian's token/ThemePlan system, compiles a serializable **BuildPlan**, and applies it through official Wix APIs first — falling back to consent-gated editor automation only where no API exists.

**The flow:**

```
Figma design
  → extract tokens + page structure          (Figma MCP: get_variable_defs / get_code / get_image)
  → write pipeline artifacts                  (tokens.json, ir.json, content.json, assets.manifest.json)
  → compile BuildPlan                         (vespasian plan → .vespasian/plans/<slug>/plan.json)
  → apply                                     (vespasian apply — API first; wix-site-builder agent for editor steps)
  → visual QA vs the Figma source             (vespasian qa / visual-qa-agent)
  → FidelityReport                            (honest record of every translation loss)
```

**Core Innovation:** Hybrid approach with a brief clarification phase (1-2 min) followed by fully autonomous execution using `superpowers:executing-plans`.

**Key Principle:** Design system FIRST → tokens.json foundation SECOND → page structure THIRD → BuildPlan FOURTH → apply FIFTH → verification SIXTH. Extract ALL design tokens wholesale before generating any page structure.

**Honesty principle:** Wix cannot express everything Figma can. Never promise "pixel-perfect" — every loss (palette compression, type-ramp overflow, spacing-in-CSS-only, layout-to-grid translation) is recorded in the FidelityReport instead of silently degraded.

## When to Use

Use this skill when:
- Converting Figma designs to a Wix site
- Building a Wix Studio site from design mockups
- Extracting a Figma design system into Vespasian tokens / a Wix ThemePlan
- Autonomously composing multiple Wix pages from Figma frames

**Trigger phrases:**
- "Convert Figma to Wix"
- "Turn this Figma design into a Wix site"
- "Build a Wix site from Figma"
- "Extract the Figma design system for Wix"
- "Figma to BuildPlan"

When NOT to use:
- InDesign or Canva sources — use `indesign-conversion` or `canva-to-wix-autonomous-workflow`
- Edits to an existing Wix site unrelated to a design source — use `wix-site-development`
- Pure token/theme work without page composition — use `wix-site-development` + `packages/wix-driver/src/translate`

## Prerequisites

Before starting, verify:
- [ ] Figma MCP configured (`.mcp.json` has figma-desktop or figma server)
- [ ] Figma file URL, or desktop app open with Dev Mode enabled
- [ ] `WIX_API_KEY` + `WIX_ACCOUNT_ID` in `.env` — **or** `VESPASIAN_DRY_RUN=1` for a no-credentials rehearsal
- [ ] For editor-channel steps: a consented session (`vespasian login --editor`) — see `wix-playwright-driver`

**Critical:** If the Figma MCP is not accessible, STOP and inform the user before proceeding. If Wix credentials are missing, continue in dry-run mode and say so — never invent credentials.

## CRITICAL: Output Location Requirements

**Vespasian's output is a live Wix site, not local theme files.** Local artifacts go here:

```
.vespasian/plans/<slug>/       ← compiled BuildPlan + siblings (plan.json, tokens.json, global.css)
.vespasian/checkpoints/        ← executor checkpoints (resume with --resume-from)
.claude/figma-data/            ← asset semantic mapping, attribute comparisons
.claude/reports/               ← completion + QA reports
```

**PRE-FLIGHT VALIDATION (before any file writes):**
1. [ ] NO files created under `themes/`, `plugins/`, or `wp-content/` (those directories must not exist)
2. [ ] Plan slug is valid (lowercase, hyphens only, no spaces)

**Auto-validation:** the registered PreToolUse hook `.claude/hooks/validate-output-location.sh` blocks WordPress-era paths.

## Fallback Design Tokens (Default Design System)

**CRITICAL:** When the Figma design system is unavailable, incomplete, or cannot be extracted, use these professional fallback defaults. The workflow NEVER blocks on a missing design system.

### Fallback Color Palette (13 tokens)

All colors are WCAG AA compliant with appropriate contrast ratios:

```javascript
const FALLBACK_COLORS = {
  // Primary palette (Professional blue-gray)
  "primary": "#34495e",           // Main brand color
  "primary-dark": "#293a4b",      // Darker variant
  "primary-darker": "#141d25",    // Darkest variant
  "primary-light": "#707f8e",     // Lighter variant
  "primary-lightest": "#eaecee",  // Lightest variant

  // Accent palette (Teal)
  "accent": "#16a085",            // Accent color
  "accent-dark": "#11806a",       // Darker accent
  "accent-darker": "#084035",     // Darkest accent
  "accent-lightest": "#e7f5f2",   // Lightest accent

  // Neutrals
  "white": "#ffffff",             // Pure white
  "black": "#0c0c0c",             // Near black (softer than pure black)
  "background": "#fdfdfd",        // Off-white background
  "gray": "#5e6060"               // Mid-tone gray
};
```

Note: Wix Studio compresses the palette into theme **role slots** (main/accent/background ramps). The translate stage (`packages/wix-driver/src/translate/palette.js`) does this mapping and records any compression as FidelityNotes — you extract everything, translation decides what fits.

### Fallback Typography (2 families, 9 sizes)

**Font families:**
- Primary: `"Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"`
- Heading: `"Questrial", "Georgia", "serif"`

**Font sizes** (9-point scale — deliberately matched to Wix's fixed 9-slot text theme H1–H6/P1–P3; larger ramps spill into `.vsp-text-*` custom CSS classes):

```javascript
const FALLBACK_FONT_SIZES = [
  { slug: "small", size: "14px", name: "Small" },          // P3
  { slug: "base", size: "16px", name: "Base" },            // P2
  { slug: "medium", size: "18px", name: "Medium" },        // P1
  { slug: "large", size: "20px", name: "Large" },          // H6
  { slug: "x-large", size: "24px", name: "Extra Large" },  // H5
  { slug: "2x-large", size: "32px", name: "2X Large" },    // H4
  { slug: "3x-large", size: "40px", name: "3X Large" },    // H3
  { slug: "4x-large", size: "56px", name: "4X Large" },    // H2
  { slug: "5x-large", size: "72px", name: "5X Large" }     // H1
];
```

### Fallback Spacing (10 tokens)

**Based on a 4px base unit.** Wix has no spacing-token system — these become `--vsp-space-*` custom properties in `global.css` (Studio-only surface):

```javascript
const FALLBACK_SPACING = [
  { slug: "20", size: "4px", name: "1" },      // --vsp-space-20
  { slug: "30", size: "8px", name: "2" },      // --vsp-space-30
  { slug: "40", size: "16px", name: "3" },     // --vsp-space-40
  { slug: "50", size: "24px", name: "4" },     // --vsp-space-50
  { slug: "60", size: "32px", name: "5" },     // --vsp-space-60
  { slug: "70", size: "40px", name: "6" },     // --vsp-space-70
  { slug: "80", size: "48px", name: "7" },     // --vsp-space-80
  { slug: "90", size: "64px", name: "8" },     // --vsp-space-90
  { slug: "100", size: "80px", name: "9" },    // --vsp-space-100
  { slug: "110", size: "112px", name: "10" }   // --vsp-space-110
];
```

A ready-made minimal tokens.json in this exact shape ships at `.claude/templates/pipeline/minimal-tokens.json`.

### When to Use Fallback Tokens

**Use fallback tokens when:**
1. The Figma file has NO design system page/frame
2. Auto-detection fails to find a design system
3. `get_variable_defs` returns empty or incomplete results
4. The user cannot provide the design system location
5. Design system extraction errors occur

**Merge strategy (when a partial design system exists):**
- Figma tokens take precedence
- Fallback tokens fill gaps
- Never leave tokens.json with missing categories

## The Workflow

### Phase 1: Discovery & Planning (1-2 minutes, Interactive)

**Step 1.1: Create the tokens.json Foundation FIRST**

⚠️ **CRITICAL:** Write `tokens.json` IMMEDIATELY, before any page discovery. This step NEVER blocks the workflow.

1. Attempt auto-detection of the design system (non-blocking). Search page/frame names: "Design System", "Styles", "Tokens", "Library", "Variables".
2. If found: extract with `get_variable_defs` — the COMPLETE system wholesale, not selectively.
3. If not found or extraction fails: use the fallback tokens (no user prompt needed).
4. Merge (Figma wins by slug, fallbacks fill gaps) and write `.vespasian/plans/<slug>/tokens.json` in the flat shape (`palette` / `fontFamilies` / `fontSizes` / `spacingSizes`).

**NEVER ask the user "where is your design system?" — auto-detection or fallbacks handle this.**

**Step 1.2: Survey Pages to Convert**

Use Figma MCP `get_image` or `get_code` to:
1. Count the page-level frames in the Figma file (1-15 expected)
2. Identify page types (homepage, about, services, contact, etc.)
3. Capture a screenshot of each page for the QA baseline

**Step 1.3: Create the Component Mapping Plan**

Map Figma components → Wix Studio elements using this reference:

| Figma component | Wix Studio target | Channel | Notes |
|----------------|-------------------|---------|-------|
| Page frame | Page | playwright | Deterministic pages-panel flow |
| Hero section | Section with background media | agent | Canvas composition, screenshot-grounded |
| Card grid | Section grid + repeated containers | agent | Studio section grids; verify column count per breakpoint |
| Navigation bar | Header section + menu | agent | Template header restyle preferred over rebuild |
| Text block | Text element bound to a text-theme slot (H1–H6/P1–P3) | agent | Never inline font sizes; overflow styles use `.vsp-text-*` |
| Image | Image element referencing **staged** media | hybrid | Upload via API first — see `wix-media-first-architecture` |
| Button / CTA | Button element | agent | Link target from content model |
| Form | Wix Forms element | agent | Field mapping is best-effort; record losses |
| Repeating collection (blog cards, team) | CMS collection + repeater | api + agent | Data via CMS API, layout via editor |
| Colors / typography | ThemePlan (theme panels) | playwright | Deterministic Site Styles flows |
| Spacing scale | `--vsp-space-*` in global.css | cli | Studio Git integration; after pages exist |

**Step 1.4: Generate the Implementation Plan**

Use `superpowers:writing-plans` to create the plan:

```
Plan structure:
1. ✅ tokens.json already created (Step 1.1)
2. Asset download + MANDATORY semantic mapping (Step 2.3)
3. For each page (1-N): extract structure → emit ir.json/content.json sections
4. Compile BuildPlan: vespasian plan .vespasian/plans/<slug>/
5. Rehearse: vespasian apply <plan> --dry-run
6. Apply: vespasian apply <plan>   (API phases run scripted; editor steps via wix-site-builder agent)
7. Publish: vespasian publish
8. Visual QA loop vs Figma screenshots: vespasian qa
9. Present FidelityReport + completion report
```

**Step 1.5: Present the Plan to the User**

Show: token mapping summary, page list, component mapping strategy, which steps will need the **editor channel** (and that it requires the consent-gated session), and the confirmation prompt: "Proceed with autonomous conversion?"

### Phase 2: Autonomous Execution (No interruptions until complete)

**Critical:** Once the user approves, use `superpowers:executing-plans` to execute WITHOUT "should I continue?" prompts.

**Step 2.1: Verify the tokens.json Foundation**

- File exists at `.vespasian/plans/<slug>/tokens.json`
- Completeness: 5+ palette entries, 7+ font sizes, 10 spacing tokens
- Valid JSON, no placeholder values

**Step 2.2: Establish Artifact Structure**

```
.vespasian/plans/<slug>/
├── tokens.json              # design tokens (Phase 1)
├── ir.json                  # page/section structure IR
├── content.json             # semantic content model (sections → blocks)
├── assets.manifest.json     # downloaded assets + semantic names
├── global.css               # translate output (--vsp-* vars, .vsp-* utilities)
└── plan.json                # compiled BuildPlan (Step 2.5)
```

**Step 2.3: MANDATORY Asset Identification & Semantic Mapping**

⚠️ **CRITICAL:** After downloading Figma assets (images with hash filenames), you MUST view every image to identify what it depicts BEFORE any structure generation. Subagents cannot guess image content from hash filenames.

**Procedure:**

1. **View every downloaded image** using the Read tool (renders images visually). Describe each PNG/JPG; identify each SVG icon/logo.
2. **Create the semantic mapping** at `.claude/figma-data/asset-semantic-mapping.json`:
   ```json
   {
     "images": {
       "abc123def456.png": {
         "description": "Group photo of team members in front of the office",
         "semantic_name": "hero-group-photo",
         "suggested_usage": ["hero section", "about page header"]
       }
     },
     "icons": {
       "aaa111bbb222.svg": { "description": "Facebook social icon", "semantic_name": "icon-facebook" }
     }
   }
   ```
3. **Record the semantic names in `assets.manifest.json`** — the BuildPlan's media phase uploads by semantic slug, and content blocks reference `assetSlug`, never raw filenames.
4. **Provide the mapping to ALL subagents** composing pages.

**Why mandatory:** hash filenames reveal nothing; a wrong hero image is always visibly wrong; this takes 2-3 minutes and prevents hours of rework. **NEVER skip. NEVER let subagents guess image assignments.**

**Step 2.4: Extract Page Structure (Autonomous Loop for 1-15 Pages)**

Initialize the queue with priority ordering:

```
Priority 1: Shared chrome (header, footer intent — usually a template restyle)
Priority 2: Homepage
Priority 3: Main pages (about, services, contact, ...)
Priority 4: Special pages (404, search, legal)
```

**For EACH page in the queue (page X of N):**

1. **Pre-Processing:** Log "Processing page {X} of {N}"; track completed/remaining; if approaching 80% context, checkpoint (see Context Management).
2. **Extract structure with error recovery:**
   ```
   Try:    structure = get_code(page_node_id)
   Catch annotation error:  image = get_image(page_node_id); analyze visually
   Catch connection error:  try the other Figma MCP server; if both fail → STOP (blocker)
   ```
3. **Match attributes to tokens:** for each component, extract layout/typography/visual/color properties; match to token slugs (exact → use slug; close → use closest, log the delta; no match used 3+ times → add a token; 1-2 uses → record a FidelityNote candidate). Save per-page data to `.claude/figma-data/{page}-attributes.json`.
4. **Emit IR + content sections:** append the page to `ir.json` (layout intent: sections, grids, breakpoint hints) and `content.json` (typed blocks: text/image/button with `assetSlug` references and text-theme roles). No hex literals in content — colors live in tokens.
5. **Accessibility:** alt text for every image block (from Figma layer names or the semantic mapping), heading-role hierarchy without skips, link text that makes sense out of context.
6. **Run the post-page hook (warn-only):**
   ```bash
   echo '{"tool_input":{"file_path":".vespasian/plans/<slug>/content.json"}}' \
     | bash .claude/hooks/figma-wix-post-page.sh
   ```
7. **Update progress** and continue — NO "should I continue?" prompt.
8. **Checkpoint** every 3 pages via episodic-memory (non-blocking).

**Step 2.5: Compile the BuildPlan**

```bash
vespasian plan .vespasian/plans/<slug>/
# → .vespasian/plans/<slug>/plan.json  (+ global.css from translate)
```

The compiler (`packages/wix-driver/src/plan`) is deterministic: same inputs → byte-identical plan. Inspect the summary: steps by phase (provision → media → data → editor → code → properties → publish → qa) and by channel (`api` / `cli` / `playwright` / `agent`). Then run the completion hook:

```bash
bash .claude/hooks/figma-wix-completion.sh .vespasian/plans/<slug>/plan.json
```

**Step 2.6: Rehearse, then Apply**

```bash
# Always rehearse first — records intended requests, writes global.css to staging,
# emits the editor step list without launching a browser:
vespasian apply .vespasian/plans/<slug>/plan.json --dry-run

# Real apply (phase-ordered, checkpointed):
vespasian apply .vespasian/plans/<slug>/plan.json
# resume after an interruption:
vespasian apply .vespasian/plans/<slug>/plan.json --resume-from editor
```

Channel discipline during apply:
- **API phases** (provision, media, data, properties, publish) run scripted — never route these through the browser.
- **Editor phase**: deterministic Playwright flows handle pages/theme panels/SEO/save; **canvas composition steps (`method: "agent"`) are executed by the `wix-site-builder` agent** driving the editor visually through the Playwright MCP (see `wix-playwright-driver`). CAPTCHA/2FA/consent issues escalate to the user — session expiry is a designed human-in-the-loop pause, not an error.
- **Code phase** (`global.css`, Velo) runs only after pages exist in the editor.

**Step 2.7: MANDATORY Visual Verification Loop**

⚠️ **CRITICAL:** After apply + publish, you MUST render the actual Wix site and compare screenshots against the Figma designs. Plan review alone cannot catch wrong images, broken grids, or theme drift.

1. **Publish (or use the preview URL):** `vespasian publish`, or resolve `previewUrl` via the Editor URLs API.
2. **For EACH page, run the loop:**
   ```
   a. Navigate to the page URL (mcp__playwright__browser_navigate)
   b. Screenshot at the three Studio breakpoints: 1280 (desktop), 900 (tablet), 375 (mobile)
   c. Get the Figma screenshot of the same page (figma MCP: get_image)
   d. View both side-by-side (Read tool) and compare section-by-section:
      - Correct images in the correct sections?
      - Grid/column layouts match per breakpoint?
      - Theme colors and text-theme roles applied (not editor defaults)?
      - Full-bleed sections actually full-bleed?
   e. Log differences; fix by editing the source artifact and re-applying the
      affected steps (idempotency keys make re-apply safe), or via a targeted
      wix-site-builder editor pass
   f. Re-verify until the page matches or the loss is a recorded FidelityNote
   ```
3. **Minimum checklist per page:** correct hero image · section backgrounds match · columns render side-by-side on desktop and stack on mobile · text readable on its background · buttons visible and styled · footer complete.
4. **Iteration rules:** max 3 rounds per page (then log and move on); image mismatches are ALWAYS fixed; readability-breaking layout issues are ALWAYS fixed; minor spacing deltas (< 8px) may become FidelityNotes.

**NEVER declare the site complete based on plan review alone.**

**Step 2.8: FidelityReport**

`vespasian qa` emits the FidelityReport (JSON + Markdown): screenshots at the three breakpoints, pixel-diff scores vs the Figma baselines, computed-style assertions on `--vsp-*` variables, and the full loss record (palette compression, type-ramp overflow into `.vsp-text-*`, spacing living only in global.css, layout translated to section/grid intent, API→editor fallbacks). Attach it to the completion summary.

### Phase 3: Completion & Handoff

```
✅ Conversion complete!

Live site: <published URL>          Editor: <editor URL>
BuildPlan: .vespasian/plans/<slug>/plan.json

Summary:
- N pages composed (X api / Y playwright / Z agent steps)
- Media staged via API with file-ready confirmation
- Theme applied: palette slots + 9-slot text theme + --vsp-* spacing
- FidelityReport: <k> recorded losses (see .claude/reports/)

Next steps:
1. Review the site in the Wix Studio editor
2. Adjust tokens in tokens.json → re-run translate/apply for theme changes
3. Wire a custom domain in the Wix dashboard when ready
```

**NO "should I continue?" during Phase 2-3.** Work autonomously until complete or blocked.

## Figma MCP Integration

### get_variable_defs
Extract design tokens from the Figma design system. **Extract the COMPLETE system wholesale, not selectively.**

### get_image
Visual reference: page survey, QA baselines, and the fallback when `get_code` fails.

### get_code
Extract component structure markup. Known issue: fails when Figma annotations are present — fall back to `get_image` analysis and continue.

**Error Recovery Pattern:**
```
Try:    result = get_code(node_id)
Catch:  log "get_code failed for {node_id}, using visual analysis"
        image = get_image(node_id) → derive sections/blocks visually
Continue (don't stop execution)
```

## Error Recovery (Autonomous)

**Pattern:** Log errors, try alternatives, NEVER stop to ask the user — except for the listed blockers.

| Error | Recovery |
|---|---|
| Figma MCP unreachable | Try both servers (desktop :3845, remote mcp.figma.com); if both fail → STOP (blocker) |
| `get_code` fails (annotations) | `get_image` + visual analysis, continue |
| Design token missing | Add to tokens.json with a sensible value, log it, continue |
| Component maps poorly to Wix | Simplify (section + text/image/button), record a FidelityNote, continue |
| Wix API 429 | The REST client backs off automatically (60s); do not hammer manually |
| API step fails after retries | `onFail` semantics apply: retry / escalate / skip-and-report |
| Editor selector drift | Probe → agent-visual fallback (see `wix-playwright-driver`), continue |
| Editor session expired / CAPTCHA / 2FA | ESCALATE to the user — human-in-the-loop pause by design. Never use captcha-solving services |
| Provisioned site is not Studio | STOP — the provisioner asserts `editorType == WIX_STUDIO`; pick an allowlisted template |

## Context Management (Multi-Page Support)

**Problem:** 6-15 pages can exhaust the context window.
**Solution:** episodic-memory checkpointing every 3 pages — plus the executor's own `.vespasian/checkpoints/` for apply-phase resumption.

**Checkpoint triggers:** every 3 completed pages · ~80% context used · before complex pages (CMS-backed listings).

**Checkpoint content:** slug, pages completed/remaining (with Figma node IDs), token summary, component-pattern decisions, errors so far, Figma file URL. Save via `/episodic-memory:save "Figma-to-Wix checkpoint: {slug}, {X} of {N} pages"`. Non-blocking — continue immediately.

**Resumption:** on "continue converting", search episodic memory for the checkpoint, reload state, and jump straight back into the Step 2.4 loop. Do NOT re-extract tokens, re-survey pages, or re-ask for plan approval. If the interruption happened during apply, resume the executor instead: `vespasian apply <plan> --resume-from <phase>`.

## Quality Gates

Invoked manually by this workflow (NOT auto-registered in `.claude/settings.json`):

- **Per-artifact:** `.claude/hooks/figma-wix-post-page.sh` — JSON validity, stray-hex audit, structure validator delegation. Warn-only.
- **On plan compile:** `.claude/hooks/figma-wix-completion.sh` — plan summary by channel, token-discipline audit over `global.css`, validator runs, markdown report to `.claude/reports/`.

Auto-registered gates that will fire on their own: the PreToolUse output-location hook, and the PostToolUse reminders (post-build-qa, bundle-guard plan-size sanity).

## No-Exceptions List

**NEVER do these (zero tolerance):**

0. ❌ **Skip asset semantic mapping (Step 2.3)** — hash filenames reveal nothing; wrong images destroy trust.
0.5. ❌ **Skip visual verification (Step 2.7)** — a plan that "looks correct" is not a site that looks correct.
1. ❌ **Skip design-system extraction** — tokens.json foundation ALWAYS comes first.
2. ❌ **Hardcode design values** — no hex in content/IR; no inline px font sizes; colors/type/spacing flow through tokens → ThemePlan/global.css.
3. ❌ **Ask "should I continue?" during the autonomous phase.**
4. ❌ **Selectively extract tokens** — ALL colors, the entire type scale, the complete spacing scale.
5. ❌ **Use the editor channel for anything an API covers** — media, data, embeds, properties, publish are API-only. The planes never substitute for each other.
6. ❌ **Place unstaged media** — upload via API + file-ready poll first (`wix-media-first-architecture`).
7. ❌ **Bypass the consent gate or automate around CAPTCHA/2FA** — escalate to the user, always.
8. ❌ **Skip accessibility** — alt text, heading hierarchy, readable contrast.
9. ❌ **Silently degrade** — every loss becomes a FidelityNote, never a shrug.

## Common Mistakes & Rationalization Detection

### "I'll just extract the main colors"
Incomplete extraction causes hardcoded values later. Extract the ENTIRE design system wholesale.

### "Let me check with the user before proceeding"
Phase 1 got approval. Asking mid-execution defeats the autonomous purpose. Continue through ALL pages.

### "This color looks close enough"
Palette integrity matters — use the token or add the exact color to tokens.json and let translate decide slot placement. Never inline hex.

### "The API doesn't cover this, so I'll click through the editor by hand-scripted selectors"
Editor DOM selectors are perishable (Wix ships dozens of releases a day). Deterministic flows exist only for the stable core (pages, theme panels, save, publish); everything canvas-shaped goes through the screenshot-grounded wix-site-builder agent with data-hooks as *hints*.

### "Dry-run passed, so we're done"
Dry-run validates the plan's shape and ordering, not visual truth. The FidelityReport and the visual loop against the live site are the finish line.

### "Studio autosaves, so publishing must have worked"
Saving is not publishing. Verify the publish via the API response and by fetching the public URL — not by trusting an editor modal.

## Integration with Skills & Agents

**Delegates to:**
- `wix-site-development` — Studio concepts: sections, grids, breakpoints, site styles, global.css
- `wix-media-first-architecture` — media staging discipline
- `wix-playwright-driver` — editor automation mechanics (both planes, consent, probe, flows)
- `visual-qa-verification` — the QA loop details
- `superpowers:writing-plans` / `superpowers:executing-plans` — planning + autonomous execution
- episodic-memory plugin — checkpointing

**Agents:** `figma-wix-converter` (owns this pipeline) → `wix-site-builder` (executes editor/agent steps) → `visual-qa-agent` (live-site comparison) → `wix-token-auditor` / `wix-structure-validator` (audits).

## Success Criteria

**Phase 1 complete when:** tokens.json written (wholesale extraction or fallback) · pages surveyed with QA baselines captured · component mapping + plan approved.

**Phase 2 complete when:** all pages in IR/content · assets semantically mapped and staged · BuildPlan compiled deterministically · dry-run clean · apply finished (escalations surfaced as `pending-agent`, not silent failures) · visual loop passed per page.

**Phase 3 complete when:** site published · FidelityReport delivered · user has editor/live URLs and next steps.

## Example Usage

```
User: "Convert this Figma design to a Wix site" [Figma URL]

Claude: "Using the figma-to-wix-autonomous-workflow skill."
        [Step 1.1: extracts design system → tokens.json (or fallbacks)]
        [Step 1.2: surveys 8 page frames, captures baselines]
        [Presents token summary + page list + channel breakdown]
        "Proceed with autonomous conversion? (Editor steps will use your
         consented session from `vespasian login --editor`.)"

User: "Yes"

Claude: [superpowers:executing-plans — uninterrupted]
        [views all assets → semantic mapping]
        [emits ir.json/content.json per page, checkpoints every 3]
        [vespasian plan → plan.json: 46 steps (31 api / 6 playwright / 7 agent / 2 cli)]
        [vespasian apply --dry-run → clean]
        [vespasian apply → wix-site-builder handles 7 canvas compositions]
        [vespasian publish → vespasian qa → visual loop fixes 2 issues]

        "✅ Live at https://<account>.wixstudio.io/<site>
         FidelityReport: 5 recorded losses (palette compressed 13→10 slots,
         2 type styles in .vsp-text-*, spacing scale in global.css only).
         Report: .claude/reports/figma-wix-completion-<ts>.md"
```

---

**Version:** 4.0.0 (Wix target)
**Last Updated:** 2026-07-06
**Supports:** 1-15 pages with autonomous checkpointing every 3 pages, dry-run rehearsal, and FidelityReport-honest delivery
