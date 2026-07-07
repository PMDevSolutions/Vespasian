# Lighthouse CI

Performance, accessibility, best-practices, and SEO budgets for the
**published Wix site**, enforced with [`@lhci/cli`](https://github.com/GoogleChrome/lighthouse-ci)
against `lighthouserc.json`.

## What lives here

| File | Purpose |
|------|---------|
| `annotate-report.mjs` | Converts lhci assertion results into GitHub `::error::`/`::warning::` annotations so failures land on the PR. |

The budget definitions live in the repo-root [`lighthouserc.json`](../../lighthouserc.json)
— the single source of truth for the performance gate.

## Running locally

```bash
export WIX_SITE_URL=https://mysite.wixsite.com/home

pnpm exec lhci collect --config=./lighthouserc.json --url="$WIX_SITE_URL/"
pnpm lighthouse:assert            # exits non-zero on any budget regression
node tests/lighthouse/annotate-report.mjs .lighthouseci/
```

`lighthouserc.json` intentionally ships **no collect URLs** — the target site
is an env-provided published URL, not a checked-in address. Pass `--url` (as
above) or use `scripts/validate-site-e2e.sh`, which wires it for you.

## CI

`.github/workflows/lighthouse-ci.yml` runs when the `WIX_SITE_URL` repository
variable is configured, and skips with a clear notice otherwise (a fork or a
fresh clone has no published site to audit). It collects against
`$WIX_SITE_URL`, asserts the budgets (hard gate), uploads the report to
temporary public storage, and annotates failures.

## Tuning budgets

Edit `lighthouserc.json`, never the workflow. The current category floors and
resource budgets are inherited from the fork ancestor and calibrated for a
lean content site; Wix's Thunderbolt runtime is heavier than a hand-rolled
theme, so expect to raise the script-size budget after measuring your real
site — do it in one reviewed commit with the measured numbers in the message.
