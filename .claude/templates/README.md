# Templates

Starter artifacts consumed by the Vespasian skills and the init wizard.

| Path | Purpose |
|---|---|
| `pipeline/minimal-tokens.json` | Minimal valid `tokens.json` in the flat mapTokens shape (`palette` / `fontFamilies` / `fontSizes` / `spacingSizes`). Use it to seed a blank project, exercise `translate` without a design source, or as the fallback token set the conversion skills merge gaps from. |
| `pipeline/example-buildplan.json` | A small BuildPlan that validates against `packages/wix-driver/src/plan/schema.js`. Shows one step per channel (`api`, `playwright`, `agent`, `cli`) with idempotency keys, verify assertions, and `onFail` semantics. Useful for dry-run rehearsals: `vespasian apply .claude/templates/pipeline/example-buildplan.json --dry-run`. |

The WordPress-era scaffolds (`theme/`, `plugin/`, `frontend/nextjs/`) were
removed in the Wix fork — Vespasian's output is a live Wix site, not local
theme/plugin files.
