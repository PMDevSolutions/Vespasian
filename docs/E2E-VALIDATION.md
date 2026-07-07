# End-to-End Validation

How to validate the design-to-Wix pipeline end to end — from a compiled BuildPlan to a published,
verified site. Three tiers, cheapest first: **plan-compile → dry-run apply → live smoke**. The
first two need zero Wix credentials and are exactly what CI runs; the third touches a real
(scratch) site.

## Tier 1 — Plan compile (static validation)

**Goal:** the pipeline turns a design input into a structurally valid BuildPlan.

```bash
# From a fixture or real input:
node bin/vespasian.mjs pipeline indesign tests/fixtures/indesign/… --plan .vespasian/plans/e2e.json
# or: node bin/vespasian.mjs plan <ir.json>

# Validate:
./scripts/shared/plan-lint.sh .vespasian/plans/e2e.json
./scripts/validate-site.sh .vespasian/plans/e2e.json
./tests/libs/bats-core/bin/bats tests/unit/site-structure.bats
```

**Checklist:**

- [ ] Plan parses and passes the zod schema (unique, stable step ids; every step has `method`,
      `idempotencyKey`, `verify`, `onFail`)
- [ ] Channel routing is legal per [wix/API-COVERAGE.md](wix/API-COVERAGE.md) (nothing routed to
      `playwright` that has an API)
- [ ] Every editor/data asset reference resolves to a media step
      ([media-first](architecture/MEDIA-FIRST-ARCHITECTURE.md))
- [ ] Token audit clean — no literal hex in translate output (`scripts/design-token-auditor/`)
- [ ] Determinism: compiling the same IR twice yields byte-identical plans

## Tier 2 — Dry-run apply (behavioral validation, no credentials)

**Goal:** the executor walks the whole plan, in phase order, against recording transports.

```bash
VESPASIAN_DRY_RUN=1 node bin/vespasian.mjs apply .vespasian/plans/e2e.json --dry-run
./scripts/validate-site-e2e.sh .vespasian/plans/e2e.json   # lint + dry-run an existing plan (+ optional live checks)
pnpm test:canva-e2e                     # what the site-validation CI gate runs: fixture compile + dry-run apply
```

**Checklist:**

- [ ] All eight phases execute in order (provision → media → data → editor → code →
      properties/embeds → publish → QA) with checkpoints written to `.vespasian/checkpoints/`
- [ ] REST recorder log shows well-formed requests (correct endpoints, exactly one of
      `wix-account-id`/`wix-site-id` per call)
- [ ] CLI recorder staged a syntactically valid `global.css` (spacing scale + overflow classes)
- [ ] Editor recorder emitted its step list without launching a browser
- [ ] Interrupt/resume works: kill mid-run, `--resume-from` continues, completed steps skip via
      idempotency keys
- [ ] No real network traffic (this is also the standing test-suite rule)

This tier is the **PR gate**: the `site-validation` CI workflow runs `pnpm test:canva-e2e`, which
compiles a BuildPlan from fixtures and dry-run applies it on every pull request — no secrets
required.

## Tier 3 — Live smoke (scratch site, real credentials)

**Goal:** the plan produces a real, published, verifiable Wix Studio site.

> Use a **dedicated dev account and a scratch site** — never a production site. Editor-plane steps
> require the one-time consent (`vespasian login --editor`). Etiquette:
> [CONTRIBUTING.md](../CONTRIBUTING.md#with-a-wix-account-live-testing-etiquette).

```bash
node bin/vespasian.mjs site create "e2e-smoke-$(date +%s)"
node bin/vespasian.mjs apply .vespasian/plans/e2e.json
node bin/vespasian.mjs publish
node bin/vespasian.mjs qa
```

### Phase checklist

**1. Provision (API)**
- [ ] Site created; `editorType == WIX_STUDIO` asserted (fails fast otherwise)

**2. Media (API)**
- [ ] All assets uploaded, every one polled to file-ready; no `SITE_QUOTA_EXCEEDED`

**3. Data (API)**
- [ ] CMS collections + items created; template bindings feed them where planned

**4. Editor (Playwright/agent)**
- [ ] Pages created/renamed/ordered per plan
- [ ] Theme colors: every slot explicitly set (no Wix auto-shades)
- [ ] Text theme: nine slots assigned; fonts matched or uploaded
- [ ] Canvas sections verified against the Layers tree, not assumed
- [ ] Per-page SEO titles/descriptions set
- [ ] Any CAPTCHA/2FA prompt paused the run and waited for a human (by design)

**5. Code (CLI)**
- [ ] `global.css` synced to the site repo *after* pages existed; publish path included code

**6–7. Properties, embeds, publish (API)**
- [ ] Business profile/properties set (field-mask handled — nothing unintentionally cleared)
- [ ] Publish returned success **and** the published URL serves the new content (never trust the
      modal)

**8. QA**
- [ ] Screenshots at 1001+ / 751–1000 / 320–750 captured
- [ ] Pixel diff vs the design renders within the agreed threshold (`scripts/visual-diff.js`)
- [ ] Computed `--wst-color-*` / `--wst-font-style-*` variables match the ThemePlan
- [ ] `--vsp-space-*` variables present on the published page (Studio custom CSS shipped)
- [ ] FidelityReport generated; every loss is either a known platform gap
      ([list](wix/API-COVERAGE.md#where-wix-doesnt-map)) or triaged as actionable

### Cross-cutting checks

- [ ] Accessibility pass on the published URL (visual-qa workflow / `accessibility-auditor` agent)
- [ ] Lighthouse run against the published URL (informational; the CI workflow skips gracefully
      when no URL secret is configured)
- [ ] Re-running `apply` on the finished site is a no-op (idempotency)
- [ ] `.vespasian/` contains plan, checkpoints, QA artifacts — and none of it is tracked by git

## Sign-off

| Tier | Gate | Where it runs |
|---|---|---|
| Plan compile | Schema + routing + token audit + determinism | Local + every PR (`site-validation`) |
| Dry-run apply | All phases execute; resume works; recorders clean | Local + every PR (`site-validation`) |
| Live smoke | Published site verified; FidelityReport triaged | Manual, scratch site, before releases |

A release is signable when all three tiers pass and the live smoke's FidelityReport contains no
untriaged actionable entries.
