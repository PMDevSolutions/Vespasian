# Testing Guide: Figma-to-Wix Autonomous Workflow

**Purpose:** step-by-step instructions to verify the conversion pipeline — first entirely offline (dry-run, no Wix account), then a live smoke test against a real Wix Studio site.

---

## Pre-Test Setup

### 1. Verify prerequisites

```bash
# MCP configuration: figma-desktop, figma, playwright
cat .mcp.json

# Skill + agent files present
ls .claude/skills/figma-to-wix-autonomous-workflow/
ls .claude/agents/figma-wix-converter.md .claude/agents/wix-site-builder.md

# Hooks present and executable
ls -l .claude/hooks/validate-output-location.sh \
      .claude/hooks/figma-wix-post-page.sh \
      .claude/hooks/figma-wix-completion.sh

# Workspace installed
pnpm install
node bin/vespasian.mjs --help
```

### 2. Prepare a test Figma file

Minimum requirements:

- 1 page named "Design System" with 3-6 color variables, 3-5 type styles, 4-6 spacing values
- 1 page frame (e.g. "Home", 1440px wide) containing a hero section (background image or color, H1, paragraph, CTA button)

Enable Dev Mode in the Figma desktop app and confirm the local MCP server responds on `http://127.0.0.1:3845`.

---

## Test 1: Dry-Run (no Wix account, no network)

**Objective:** exercise extract → plan → apply end-to-end with the recording transports. This is also what CI runs.

### Step 1 — invoke the skill

```
"Convert the Home frame from my Figma file to a Wix site.
 File URL: <your Figma URL>. Run in dry-run mode."
```

Expected: Claude invokes `figma-to-wix-autonomous-workflow`, writes
`tokens.json` first, surveys the frame, and presents the plan.

### Step 2 — verify the artifacts

```bash
ls .vespasian/plans/<slug>/
# tokens.json  ir.json  content.json  assets.manifest.json

# tokens are valid (flat shape)
jq '.palette | length' .vespasian/plans/<slug>/tokens.json

# no stray hex outside token definitions
bash .claude/hooks/figma-wix-post-page.sh .vespasian/plans/<slug>/content.json
```

### Step 3 — compile and inspect the BuildPlan

```bash
vespasian plan .vespasian/plans/<slug>/
jq '{steps: (.steps|length), byMethod: (.steps|group_by(.method)|map({(.[0].method): length})|add)}' \
   .vespasian/plans/<slug>/plan.json
bash .claude/hooks/figma-wix-completion.sh .vespasian/plans/<slug>/plan.json
```

Pass criteria: plan validates, deterministic (re-run → byte-identical), phases ordered provision → media → data → editor → code → properties → publish → qa.

### Step 4 — dry-run apply

```bash
VESPASIAN_DRY_RUN=1 vespasian apply .vespasian/plans/<slug>/plan.json --dry-run
```

Expected:
- REST steps logged as intended requests (no network; secrets redacted)
- `global.css` written to the local staging directory with `--vsp-*` variables
- Editor steps emitted as a step list — no browser launched
- Exit 0; request log under `.vespasian/dryrun/`

No credentials, no browser, no Wix site touched. If any step attempts a real network call in dry-run, that is a bug — file it.

---

## Test 2: Live Smoke Test (real Wix Studio site)

**Objective:** prove the two auth planes and the publish path against a real site. Requires a Wix account you own; expect to consume one site slot.

### Prerequisites

```bash
# .env (gitignored):
#   WIX_API_KEY=...        # account-level key from manage.wix.com/account/api-keys
#   WIX_ACCOUNT_ID=...
./scripts/wix-environment-manager/check-environment.sh   # env vars + API reachability

# One-time consented editor login (headed; you solve CAPTCHA/2FA yourself):
vespasian login --editor
```

### Step 1 — provision + apply

```bash
vespasian apply .vespasian/plans/<slug>/plan.json
```

Watch for:
- Provision asserts `editorType == WIX_STUDIO` (fails fast otherwise — pick an allowlisted template)
- Media phase polls file-ready before any placement
- Editor phase: deterministic flows for pages/theme; `agent` steps hand off to wix-site-builder; any CAPTCHA/2FA pauses for you — that is by design
- Checkpoints written to `.vespasian/checkpoints/` (interrupt and `--resume-from editor` to test resumption)

### Step 2 — publish + verify

```bash
vespasian publish
curl -sI <published-url> | head -1     # expect HTTP 200 — verify by fetch, not by editor modal
vespasian qa
```

Pass criteria:
- Published URL serves the site
- QA screenshots at 1280/900/375 exist and pixel-diff against the Figma baselines
- FidelityReport lists every known loss (palette compression, `.vsp-text-*` overflow, spacing in global.css) — an empty report for a non-trivial design is suspicious, not good

### Step 3 — visual loop

Follow SKILL.md Step 2.7: side-by-side comparison per page, fix, re-apply affected steps (idempotency keys make this safe), re-verify.

### Cleanup

Delete the smoke-test site from the Wix dashboard (no site-delete API — manual step), or keep it as the staging environment in `.claude/config/deployment/staging.yml`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `get_code` errors | Figma annotations | Expected — the skill falls back to `get_image` analysis |
| 401/403 from wixapis.com | Bad key or missing `wix-account-id`/`wix-site-id` header | Re-check `.env`; exactly ONE of account/site header per call |
| 429s | Rate limiting | The client backs off 60s automatically; don't retry manually |
| Editor steps all escalate | No consented session | Run `vespasian login --editor`; check `.vespasian/session/state.json` exists |
| Provision fails "not Studio" | Template not Studio-flavored | Use an allowlisted Studio template ID |
| Publish "succeeds" but site unchanged | Trusted the modal | Verify via public fetch; re-run `vespasian publish` |
