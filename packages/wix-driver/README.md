# @vespasian/wix-driver

The Wix output layer of Vespasian: everything downstream of the design tokens.
Where Flavian generated WordPress theme files, this package compiles a
**BuildPlan** and applies it to a **live Wix Studio site** — official REST APIs
first, the Wix CLI/Git integration for code, and consent-gated Playwright
editor automation only where no API exists.

```
tokens.json ─→ translateTokens ─→ ThemePlan + global.css (+ FidelityNotes)
ir/content/tokens/assets ─→ compilePlan ─→ BuildPlan (ordered, resumable steps)
BuildPlan ─→ executePlan ─→ live Wix site   (rest | cli | editor transports)
published URL ─→ qa ─→ screenshots + FidelityReport
```

Architecture: [`docs/wix/ARCHITECTURE.md`](../../docs/wix/ARCHITECTURE.md).
Per-operation channel matrix: `docs/wix/API-COVERAGE.md`.

## Module map

| Module | What it does |
|---|---|
| `src/rest/` | Typed `fetch` client per API family (projects, siteActions, sites, editorUrls, media, data, embeds, properties, seoFiles). Header injection (`Authorization` + exactly one of `wix-account-id`/`wix-site-id`), 60s backoff on 429, structured `WixApiError` taxonomy (`auth`/`scope`/`quota`/`not-found`/`conflict`/…), revision-aware updates. |
| `src/dryrun/` | Recording transport: same interface, canned responses, request log (secrets redacted) + optional JSONL under `.vespasian/dryrun/`. Activated by `VESPASIAN_DRY_RUN=1` or `{ dryRun: true }`. |
| `src/auth/` | API-key credential resolution (Plane 1) + re-exported editor session/consent gate (Plane 2). |
| `src/translate/` | tokens → ThemePlan + `global.css`: palette → Studio role slots + ≤25 site colors, type ramp → 9 text-theme slots (+ `.vsp-text-*` overflow), fonts → builtin match or WOFF2 upload plan, spacing → `--vsp-space-*` vars + `.vsp-p-*`/`.vsp-m-*` utilities. Every loss becomes a FidelityNote. |
| `src/plan/` | BuildPlan compiler over plain parsed JSON artifacts (`ir.json`, `content.json`, `tokens.json`, `assets.manifest.json`) — deterministic: same inputs → byte-identical plan. |
| `src/executor/` | Phase-ordered runner (provision → media → data → editor → code → properties → publish → qa) with per-phase checkpoints, `--resume-from`, per-step `onFail` semantics; escalations surface as `pending-agent` entries, not failures. |
| `src/editor/` | Playwright driver: persistent session (storageState), consent gate, DOM probe + cached selector maps, deterministic flows (pages, theme colors/typography, SEO panel, save, publish fallback, media picker). Import-safe without a browser (lazy playwright). |
| `src/cli/` | Git-integration + `wix` CLI wrapper: stages `src/styles/global.css`/Velo files, shells out only when `git`/`wix` exist, otherwise returns runnable instructions. Enforces "pages before code push". |
| `src/qa/` | Published-site screenshots at 1280/900/375, computed `--wst-*`/`--vsp-*` variable assertions, FidelityReport (JSON + Markdown). |

## Quick start (no Wix account needed)

```js
import {
	compilePlan,
	executePlan,
	createDryRunClient,
	createCliChannel,
	buildFidelityReport,
} from '@vespasian/wix-driver';
import { readFileSync } from 'node:fs';

const load = (p) => JSON.parse(readFileSync(p, 'utf8'));

const plan = compilePlan(
	{ ir: load('ir.json'), content: load('content.json'), tokens: load('tokens.json'), assets: load('assets.manifest.json') },
	{ templateId: '<confirmed-studio-template-guid>' },
);

const report = await executePlan(plan, {
	rest: createDryRunClient(),                       // recording transport, zero credentials
	cli: createCliChannel({ dryRun: true }),          // stages files under .vespasian/dryrun/site-repo
	checkpointDir: '.vespasian/checkpoints',
});

console.log(report.phases);        // every api/cli phase completes
console.log(report.pendingAgent);  // editor steps handed to the wix-site-builder agent
console.log(buildFidelityReport({ translate: report.fidelity, pendingAgent: report.pendingAgent }));
```

Live runs swap `createDryRunClient()` for `createRestClient()` (reads
`WIX_API_KEY` / `WIX_ACCOUNT_ID` / `WIX_SITE_ID`) and attach an editor driver
once `vespasian login --editor` has recorded consent and a session.

## Environment variables

| Variable | Purpose |
|---|---|
| `WIX_API_KEY` | Account-level API key (required for live REST calls) |
| `WIX_ACCOUNT_ID` | Account GUID — account-level calls |
| `WIX_SITE_ID` | Default target site GUID — site-level calls |
| `WIX_METASITE_ID` | Cached metaSiteId for dashboard/editor URLs (optional) |
| `WIX_EDITOR_STORAGE_STATE` | Session path (default `.vespasian/session/state.json`) |
| `WIX_EDITOR_HEADLESS` | `'false'` by default — headed is the conservative choice |
| `WIX_EDITOR_TOTP_SECRET` | Reserved — TOTP re-auth not implemented in v0.1; expiry pauses for a human login |
| `WIX_EDITOR_SLOWMO_MS` | Human-plausible pacing (default 150) |
| `VESPASIAN_DRY_RUN` | `1` → both planes become recording transports |

## Honest limitations

- **No API** exists for page structure, canvas composition, theme colors/
  typography, font upload, or static-page SEO — those steps run through the
  editor plane and are inherently brittle (Wix ships dozens of releases a day).
- Editor automation is a **Wix ToU §2.2 gray area**. It stays off until the
  user records explicit consent (`vespasian login --editor`), runs headed at
  human pace on the user's own account, and never uses CAPTCHA-solving
  services. Session expiry is a designed human-in-the-loop pause.
- Wix cannot express everything a design system produces: palettes compress
  into ≤25 site colors, type ramps into 9 slots, spacing lives only in
  `global.css`. Every loss is recorded in the **FidelityReport** — honest
  degradation instead of a fake "pixel-perfect" promise.
- A handful of endpoint paths (sites query/count, published-site URLs,
  robots/llms.txt) are best-effort pending live verification; each is marked
  at its single point of definition in `src/rest/`.

## Tests

```bash
pnpm --filter @vespasian/wix-driver test
```

`node --test`, no network, no browser: fake-fetch transport tests, request-
shape tests per REST family, translate edge cases (>25 colors, ramp overflow),
plan determinism + a golden snapshot, a dry-run end-to-end executor run, and
the consent gate.
