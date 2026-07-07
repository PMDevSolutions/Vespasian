# Common Failures & Fixes — the design-to-Wix pipeline

A failure catalog for the Figma/Canva/InDesign → Wix conversion workflows, organized by pipeline
stage, with recovery procedures. Environment-level problems (auth, 429s, session expiry, editor
type) are in [TROUBLESHOOTING.md](TROUBLESHOOTING.md); MCP connectivity in
[MCP-TROUBLESHOOTING.md](MCP-TROUBLESHOOTING.md).

## Quick reference

| # | Failure | Stage | Fix |
|---|---|---|---|
| [1.1](#11-figma-mcp-returns-no-variables) | Figma MCP returns no variables | Extraction | Enable Dev Mode, publish variables/styles |
| [1.2](#12-canva-export-has-no-usable-tokens) | Canva export has no usable tokens | Extraction | Check `style.css` exists; fallback tokens kick in |
| [1.3](#13-indesign-parse-warnings-flood) | InDesign parse warnings flood | Extraction | Prefer IDML over PDF; read the fidelity report |
| [2.1](#21-plan-fails-structure-validation) | Plan fails structure validation | Planning | `validate-structure.sh` pinpoints the step |
| [2.2](#22-token-audit-rejects-literal-hex) | Token audit rejects literal hex | Planning | Re-run translate; map values to slots/`--vsp-*` |
| [2.3](#23-no-suitable-studio-template) | No suitable Studio template | Planning | Fall back to the closest template + more canvas deltas |
| [3.1](#31-provision-editortype-assertion-fails) | Provision: editorType assertion fails | Apply | Use the confirmed-Studio allowlist |
| [3.2](#32-media-stuck-not-ready) | Media stuck "not ready" | Apply | Poll timeout ↑, re-apply; check quota |
| [3.3](#33-editor-step-cant-find-its-panel) | Editor step can't find its panel | Apply | Probe → retry → agent-visual escalation |
| [3.4](#34-canvas-composition-diverges-from-intent) | Canvas composition diverges from intent | Apply | Verify clauses + Layers-tree re-read; re-run step |
| [3.5](#35-code-push-rejected-page-missing) | Code push rejected (page missing) | Apply | Editor phase must precede code phase |
| [3.6](#36-apply-interrupted-midway) | Apply interrupted midway | Apply | `--resume-from <phase>` |
| [4.1](#41-published-site-missing-styles) | Published site missing styles | Post-publish | Re-apply theme step; check `global.css` shipped |
| [4.2](#42-fidelityreport-full-of-losses) | FidelityReport full of losses | Post-publish | Expected — triage real regressions vs platform limits |
| [4.3](#43-qa-diff-fails-on-fonts) | QA diff fails on fonts | Post-publish | Font fallback/upload; see report's font list |

---

## 1. Extraction failures

### 1.1 Figma MCP returns no variables

**Symptoms:** the converter reports an empty design system; no colors/typography extracted.

**Causes & fixes:**
1. Dev Mode not enabled — toggle `</>` in the Figma desktop app (Professional+ plan required).
2. The file uses raw styles, not published variables — publish variables/styles, or let the
   converter fall back to per-node style sampling (lower provenance quality, noted in the report).
3. MCP not connected at all — [MCP-TROUBLESHOOTING.md](MCP-TROUBLESHOOTING.md).

### 1.2 Canva export has no usable tokens

**Symptoms:** `parse-canva-export.sh` emits fallback tokens only.

**Causes & fixes:**
1. The export ZIP didn't include `style.css` (free-tier DevTools workaround missed it) — see
   [canva-to-wix/EXPORT-GUIDE.md](canva-to-wix/EXPORT-GUIDE.md).
2. Colors are inline on elements rather than in CSS — the parser samples them, but a tight,
   consistent palette in Canva converts far better (Studio caps site colors at 25).

### 1.3 InDesign parse warnings flood

**Symptoms:** dozens of `color-out-of-gamut` / `font-fallback` / `spacing-approximate` warnings.

**Causes & fixes:**
1. PDF input — the lossy fallback path. Re-export `.idml` if at all possible
   ([PDF fidelity](pipeline/indesign-pdf-fidelity.md)).
2. CMYK/LAB swatches — expected conversion warnings; confirm brand colors against the report.
3. Print fonts with no web equivalent — extend `packages/pipeline/config/font-map.json` or plan a
   font upload (WOFF2, < 4 MB).

## 2. Planning failures

### 2.1 Plan fails structure validation

**Symptoms:** `vespasian apply` refuses the plan; `scripts/wix-structure-validator/validate-structure.sh`
lists offending steps.

**Causes & fixes:**
1. An editor/data step references a `mediaRef` with no corresponding media step — regenerate the
   plan; assets must be staged first ([media-first](architecture/MEDIA-FIRST-ARCHITECTURE.md)).
2. Steps out of phase order (e.g. code before editor) — the compiler enforces phase ordering;
   hand-edited plans are the usual culprit. Recompile with `vespasian plan`.
3. A step's `method` disagrees with the channel routing in
   [wix/API-COVERAGE.md](wix/API-COVERAGE.md) — e.g. `playwright` for an operation with an API row.

### 2.2 Token audit rejects literal hex

**Symptoms:** `scripts/design-token-auditor/` (or the pre-commit guard) flags raw `#rrggbb` values
in translate output.

**Fix:** every color must reference a theme slot or a `--vsp-*`/`--wst-*` variable. Re-run the
translate stage; if a color genuinely has no slot (palette overflow), it belongs in `global.css`
as a named custom property — never inline on a step.

### 2.3 No suitable Studio template

**Symptoms:** the planner can't find a confirmed-Studio template resembling the design's page set.

**Fix:** the planner falls back to the closest allowlisted template and plans more canvas deltas —
expect a longer editor phase and more FidelityReport entries. You can also pick a template
explicitly (`vespasian site create "My Site" --template-id <guid>`), provided it's on the confirmed-Studio
allowlist (unverified templates fail the editorType assertion — by design).

## 3. Apply failures

### 3.1 Provision: editorType assertion fails

**Symptoms:** `editorType is not WIX_STUDIO` immediately after site creation.

**Fix:** the template produced a classic/Harmony site. Use `vespasian site create` with the
curated allowlist; report the offending template ID so it can be removed. There is no supported
editor conversion — provision a fresh site. See
[TROUBLESHOOTING.md](TROUBLESHOOTING.md#editor-type).

### 3.2 Media stuck "not ready"

**Symptoms:** media phase times out polling file-ready; later steps `skip-and-report`.

**Causes & fixes:**
1. Large print-resolution images — optimize first (`scripts/assets/optimize-images.sh`); use the
   resumable upload path for files > 10 MB.
2. `SITE_QUOTA_EXCEEDED` — free-plan media quota; trim assets or upgrade.
3. Transient — re-run `vespasian apply --resume-from media`; idempotency keys skip completed
   uploads.

### 3.3 Editor step can't find its panel

**Symptoms:** a deterministic flow (pages, theme colors, SEO panel) fails with a selector miss.

**What happens automatically:** the driver re-probes the DOM (selectors are hints, not
contracts), retries once, then escalates to the agent-visual path; a screenshot is saved under
`.vespasian/` for diagnosis.

**Your moves:**
1. Re-run with `--resume-from editor` — Wix ships dozens of releases a day; transient UI drift is
   normal.
2. If a flow fails persistently across days, the selector map needs updating — file an issue with
   the failure screenshot.
3. Check the session isn't expired (a login page looks like "everything missing") —
   `vespasian login --editor`.

### 3.4 Canvas composition diverges from intent

**Symptoms:** the built section doesn't match the plan's intent (wrong order, missing child,
misplaced element).

**What happens automatically:** each agent step verifies against the Layers/Pages tree — a
mismatch marks the step failed and honors its `onFail` (usually `escalate`).

**Your moves:**
1. Re-run the step (`--resume-from editor`) — agent-visual work is retryable; idempotency keys
   prevent duplicates.
2. Simplify the source design region (deep overlaps translate poorly — see the input-specific
   tips in each pipeline's guide).
3. Accept and refine by hand in the Studio editor; the divergence is recorded in the
   FidelityReport either way.

### 3.5 Code push rejected (page missing)

**Symptoms:** the CLI phase fails pushing a page code file, or `global.css` lands but page code
doesn't.

**Fix:** pages must exist in the editor **before** code push — the executor sequences this, but a
`--resume-from code` after a partial editor phase can violate it. Resume from `editor` instead.
Never rename page code files (filenames embed internal page IDs).

### 3.6 Apply interrupted midway

**Symptoms:** network drop, Ctrl-C, editor crash mid-apply.

**Fix:** applies are checkpointed per phase:

```bash
node bin/vespasian.mjs apply .vespasian/plans/<slug>.json --resume-from <phase>
# phases: provision | media | data | editor | code | properties | publish | qa
```

Completed steps are skipped via idempotency keys. Checkpoints live in `.vespasian/checkpoints/`.

## 4. Post-publish failures

### 4.1 Published site missing styles

**Symptoms:** published site renders with default Wix styling, or spacing/typography overflow
classes have no effect.

**Causes & fixes:**
1. Theme panel steps didn't complete — `vespasian qa` asserts computed `--wst-*` variables; re-run
   `--resume-from editor`.
2. `global.css` never shipped — the CLI channel requires the site to be Git-connected and the Wix
   CLI installed; check the code phase log. Note `global.css` (and thus spacing/typography
   overflow) is **Studio-only**.
3. Published before the code phase — re-publish via the CLI path so repo code is included.

### 4.2 FidelityReport full of losses

**Not a failure.** Palette compression, spilled type styles, spacing-in-CSS-only, and layout
intent translation are **platform limits**, recorded honestly
([the list](wix/API-COVERAGE.md#where-wix-doesnt-map)). Triage:

- **Expected:** entries matching the known-gaps list — accept or adjust the design system.
- **Actionable:** API→editor fallbacks that shouldn't have happened, skipped steps, verify
  failures — these usually re-run clean (`--resume-from`).

### 4.3 QA diff fails on fonts

**Symptoms:** pixel diffs concentrated on text; letterforms differ from the design.

**Causes & fixes:**
1. A font fell back — check the report's font-fallback list; upload the real font via the
   editor's Upload Fonts dialog (WOFF2, < 4 MB) and re-run the editor phase.
2. Variable-font axes — unsupported by Wix; pick static instances in the source design.
3. Wix built-in "match" is a different cut/version of the family — exact font versions are lost
   on Wix; accept or self-supply the exact WOFF2.

## Recovery procedures (general)

1. **Diagnose the environment first:**
   `./scripts/wix-environment-manager/check-environment.sh` — most "pipeline" failures are auth,
   quota, or session problems.
2. **Rehearse before retrying live:** `vespasian apply <plan> --dry-run` replays the plan against
   recording transports and catches structural problems for free.
3. **Resume, don't restart:** `--resume-from <phase>` + idempotency keys make re-runs cheap and
   safe.
4. **Read the two reports:** the pipeline generation report (unmapped nodes, font fallbacks) and
   the FidelityReport (what the apply couldn't express). Between them, every gap is accounted for.
5. **Escalations are designed:** CAPTCHA/2FA prompts and session expiry intentionally stop the
   run and wait for a human. Complete the manual step, then resume.
