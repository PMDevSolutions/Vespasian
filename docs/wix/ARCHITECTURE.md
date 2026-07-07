# Vespasian Architecture — the Wix Output Layer

Vespasian converts designs (Figma · Canva · InDesign) into live **Wix** sites. The design-ingestion
front end is inherited from [Flavian](https://github.com/PMDevSolutions/Flavian) unchanged: parsers
emit a zod-validated design IR plus a semantic content model, and a neutral token mapper extracts
color / typography / spacing tokens with full provenance. What changes in Vespasian is everything
downstream of the tokens: instead of generating WordPress FSE theme files, the pipeline compiles a
**Wix build plan** and an executor applies it to a real Wix site through official Wix APIs first and
Playwright-driven editor automation only where no API exists.

```
design in (Figma / Canva / InDesign)
   → parse → IR + content model            (inherited from Flavian, unchanged)
   → map   → design tokens + provenance    (inherited from Flavian, unchanged)
   → translate → ThemePlan + global.css    (packages/wix-driver/src/translate)
   → plan  → BuildPlan (ordered steps)     (packages/wix-driver/src/plan)
   → execute → live Wix site               (packages/wix-driver/src/executor → rest | cli | editor)
   → QA    → screenshots + FidelityReport  (packages/wix-driver/src/qa + visual-qa agent)
```

## Product decision: Wix Studio first

Vespasian targets **Wix Studio** sites, exclusively in v1:

- Studio is the only Wix editor flavor with **custom CSS** (`global.css` via Git integration) — the
  only fully headless styling channel, and where spacing tokens and typography overflow live.
- Studio has real **responsive breakpoints** (desktop 1001+ / tablet 751–1000 / mobile 320–750,
  plus custom) and section grids — the only sane target for a layout IR.
- Classic Editor (no custom CSS, no breakpoints, absolute layout) is unsupported in v1; a future
  "degraded" profile may map onto it with recorded fidelity losses.

Because it is **unverified** whether API-created sites always land on the Studio editor, the
provisioner asserts `editorType == WIX_STUDIO` (via the Editor URLs API) immediately after creating
a site, keeps a curated allowlist of confirmed-Studio template IDs, and fails fast otherwise.

Strategy is **template-first**: pick the closest Studio template as the layout seed, push content
and media through APIs, restyle via theme panels + `global.css`, and keep the browser-automation
surface as small as possible.

## Two auth planes

| Plane | Used for | Mechanism |
|---|---|---|
| **API** (primary) | site create/list, media upload, CMS data, custom embeds, site properties, publish | Account-level **API key** from [manage.wix.com/account/api-keys](https://manage.wix.com/account/api-keys), sent as `Authorization: <key>` plus exactly one of `wix-account-id` / `wix-site-id` |
| **Editor** (fallback) | pages, sections/elements, theme panels, per-page SEO, font upload | Real browser session: one-time **headed** login via `vespasian login --editor` (human solves CAPTCHA/2FA once), persisted with Playwright `storageState` and reused |

The planes never substitute for each other: API keys cannot open the editor, and the editor session
is never used for calls an API covers.

Environment variables (all loaded from `.env`, which is gitignored — never commit credentials):

```
WIX_API_KEY                # account-level API key (required)
WIX_ACCOUNT_ID             # account GUID (required)
WIX_SITE_ID                # default target site GUID (optional; written by `vespasian site create|use`)
WIX_METASITE_ID            # cached metaSiteId for dashboard/editor URLs (optional)

WIX_EDITOR_STORAGE_STATE   # persisted session path (default .vespasian/session/state.json, gitignored)
WIX_EDITOR_HEADLESS        # 'false' by default — headed editor automation is the conservative choice
WIX_EDITOR_TOTP_SECRET     # reserved — TOTP re-auth not implemented in v0.1; expiry pauses for a human login
WIX_EDITOR_SLOWMO_MS       # human-plausible pacing for editor flows (default 150)

VESPASIAN_DRY_RUN          # '1' turns both planes into no-op recording transports (CI mode)
```

### Consent & compliance

Editor automation is a Wix ToU gray area (Wix ToU §2.2 restricts automated access; automation of
*your own* account is unaddressed). The Playwright plane is therefore **off** until the user runs
`vespasian login --editor` and acknowledges an explicit consent prompt. Editor automation always
runs on the user's own account and credentials, headed by default, at human pace, and every
operation that has an official API uses the API instead. Never use captcha-solving services;
session expiry is a designed human-in-the-loop pause, not an error.

## Operation channels

Full per-operation table: [API-COVERAGE.md](API-COVERAGE.md). Summary:

| Channel | Operations |
|---|---|
| **API** (REST, `www.wixapis.com`) | create/clone/list sites, resolve editor URLs + editor type, media upload (+ file-ready polling), CMS collections & items, custom embeds (head/body snippets), site properties, robots/llms.txt, **publish** |
| **CLI** (Wix Git integration + `wix` CLI) | `src/styles/global.css` (custom CSS = spacing tokens, typography overflow), Velo page/backend code — only **after** pages exist in the editor |
| **Playwright** (editor session) | create/rename/reorder pages, theme color palette, text theme (H1–H6/P1–P3), font upload, per-page SEO, save; deterministic scripted flows for these stable panels |
| **Agent-visual** (Playwright MCP / screenshot-grounded) | canvas composition: add sections, text, images, buttons; position within section grids — driven visually by the wix-site-builder agent because editor DOM selectors are perishable |
| **Hybrid** | image placement (API upload → editor picker), spacing (`global.css` vars + editor defaults) |

## BuildPlan

The pipeline IR compiles into a serializable, diffable, resumable **BuildPlan**: an ordered list of
steps `{ id, op, method: 'api'|'cli'|'playwright'|'agent', input, idempotencyKey, verify, onFail:
'retry'|'escalate'|'skip-and-report' }`. The BuildPlan is the contract between the design pipeline
and the Wix output layer — the Vespasian analog of Flavian's generated theme files. `vespasian plan`
compiles one; `vespasian apply` executes it.

Executor phase ordering (checkpointed for `--resume-from`):

1. **Provision** (API): create from template, assert Studio editor
2. **Media** (API): upload all assets, poll file-ready
3. **Data** (API): CMS collections + items
4. **Editor** (Playwright/agent): pages, theme panels, canvas composition, per-page SEO
5. **Code** (CLI): `global.css`, Velo files — after pages exist
6. **Properties & embeds** (API)
7. **Publish** (API)
8. **QA**: screenshot at the three Studio breakpoints, pixel-diff vs the design, emit FidelityReport

## FidelityReport

Wix cannot express everything a design system produces. Instead of silently degrading, every apply
emits a **FidelityReport** recording each translation loss: palette compression into theme slots,
type styles spilled into custom CSS classes (invisible to the editor's theme UI), spacing scale
living only in `global.css`, layout translated from absolute coordinates into section/grid intent,
and any step that fell back from API to editor automation. Honest degradation reporting replaces
the "pixel-perfect" promise of the WordPress target.

## Dry-run mode

`VESPASIAN_DRY_RUN=1` (or `vespasian apply --dry-run`) swaps both transports for recorders: the REST
client logs intended requests against bundled fixtures, the CLI channel writes `global.css`/Velo
output to a local staging directory, and the editor driver emits its step list without launching a
browser. CI exercises IR → translate → plan → execute end-to-end with zero Wix credentials.

## Package layout

```
packages/wix-driver/src/
├── auth/        # ApiKeyAuth (env + header injection), EditorSession (storageState), consent gate
├── rest/        # typed fetch client per API family: projects, siteActions, sites, editorUrls,
│                #   media, data, embeds, properties, seoFiles; 429 backoff, revision-aware updates
├── cli/         # Git-integration + `wix` CLI wrapper: global.css & Velo push, publish-with-code
├── editor/      # Playwright driver: session, DOM probe (selector map cache), deterministic flows
│                #   (pages, theme panels, save, SEO, media picker), agent escalation hook
├── translate/   # tokens → ThemePlan + global.css (palette slots, text theme ramp, --vsp-space-*)
├── plan/        # BuildPlan compiler from pipeline IR + content model + tokens
├── executor/    # phase-ordered runner with checkpoints and --resume-from
├── qa/          # published-site screenshots, computed-style assertions, FidelityReport
└── dryrun/      # recording transports for CI
```

`bin/vespasian.mjs` subcommands: `init`, `login --editor`, `site create|use|list`,
`pipeline <indesign|figma|canva> <input>`, `plan`, `apply [--dry-run|--resume-from <phase>]`,
`publish`, `qa`.

## Known gaps (v1)

- **No API for page structure or layout composition** — pages/sections/elements are editor-only.
- **No theme write API** — palette and text themes are set through editor panels only.
- **No spacing tokens in Wix** — the spacing scale lives in `global.css` custom properties.
- Fixed 9-slot type ramp; larger ramps spill into custom CSS classes.
- Palette compression into theme slots; shades set explicitly to avoid Wix auto-gradient drift.
- No font-upload API; font registration is an editor dialog (WOFF2 preferred, < 4 MB).
- No static-page SEO API; per-page meta set via the editor panel.
- Media files need a file-ready poll before they can be referenced.
- Editor automation is brittle by nature: Wix ships dozens of releases a day; selectors are
  perishable, hence the probe + agent-visual strategy.
