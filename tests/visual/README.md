# Visual regression suite

Catches unintended UI changes on the **published Wix site** by diffing fresh
Playwright captures against committed baseline screenshots. Runs in CI when a
`WIX_SITE_URL` repository variable is configured; can also be run locally.

## Quick start

```bash
export WIX_SITE_URL=https://mysite.wixsite.com/home   # published site
pnpm install
pnpm exec playwright install chromium

bash scripts/visual-capture.sh    # captures into tests/visual/actual/
pnpm visual:diff                  # pixelmatch vs tests/visual/baselines/
```

## Layout

```
tests/visual/
├── urls.json        ← page/breakpoint matrix (paths relative to WIX_SITE_URL)
├── masks.json       ← selectors masked before diffing (dynamic content)
├── thresholds.json  ← per-path mismatch tolerances
├── capture.mjs      ← Playwright capture engine (WIX_SITE_URL wins over baseUrl)
├── seed.sh          ← explains deterministic seeding on Wix (= re-apply a BuildPlan)
├── print-report.mjs ← human-readable diff report
├── baselines/       ← committed reference PNGs
├── actual/          ← fresh captures (gitignored)
└── diffs/           ← diff images (gitignored)
```

## Deterministic content

There is no local database to seed. The site's content is whatever the last
`vespasian apply` + `vespasian publish` put there, so a stable baseline site
means: pin a fixture BuildPlan, apply it, publish, then capture. `seed.sh`
prints exactly this recipe (and no-ops without `WIX_SITE_ID`).

Time-sensitive content that can't be pinned (dates, embedded video posters)
is masked via `masks.json` — Wix's generated class names are unstable, so
prefer `data-hook` attributes and semantic selectors.

## Updating baselines

After an intentional UI change has been applied and published:

```bash
WIX_SITE_URL=<published-url> bash scripts/visual-update-baselines.sh
```

This captures inside the same Playwright Docker image CI uses (identical font
rendering); pass `--no-docker` to capture on the host instead. Review the
`git diff` of `tests/visual/baselines/` and commit.

In CI, the `visual-regression` workflow's `bootstrap=true` dispatch input
captures and commits fresh baselines from the runner.

## Thresholds

`thresholds.json` sets the acceptable mismatch ratio per path (default 0.5%).
Tighten once baselines have proven stable; loosen only with a comment
explaining which dynamic region justifies it (prefer masking over loosening).
