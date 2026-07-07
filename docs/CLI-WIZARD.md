# The `vespasian` CLI and setup wizard

Two entry points, one code path:

- **`pnpm run init`** — the interactive setup wizard (`scripts/init.mjs`), run once per checkout.
- **`node bin/vespasian.mjs …`** (or just `vespasian …` when linked) — the CLI for everything after
  setup.

## The setup wizard (`vespasian init` / `pnpm run init`)

The wizard collects your Wix credentials and project defaults, then writes a `.env` (from
`.env.example`) and verifies it can reach the Wix APIs. It never prints or stores credentials
anywhere except `.env`, which is gitignored.

### Prompts

| Prompt | Maps to | Notes |
| --- | --- | --- |
| Project name | project defaults | Used as the default site display name |
| Wix API key | `WIX_API_KEY` | Account-level key from [manage.wix.com/account/api-keys](https://manage.wix.com/account/api-keys); input hidden |
| Wix account ID | `WIX_ACCOUNT_ID` | Account GUID |
| Target site | `WIX_SITE_ID` | Enter an existing site's GUID (find it via `vespasian site list`), or leave unset and run `vespasian site create` later |
| Editor automation | — | Explains the consent model and points to `vespasian login --editor`; the wizard itself never opens a browser |

### Non-interactive mode

```bash
pnpm run init -- --yes --name=my-site
```

`--yes` accepts defaults for everything not supplied; credentials are read from existing
environment variables (`WIX_API_KEY`, `WIX_ACCOUNT_ID`) when present. Run
`pnpm run init -- --help` for the authoritative flag list.

### One code path with the GUI

The desktop GUI's **Setup wizard** screen calls the same `resolveDefaults()` / `apply()` functions
from `scripts/init/` in-process — same inputs, same validation, same `.env` output. There is no
duplicated setup logic; anything documented here holds for the GUI too. See [GUI.md](GUI.md).

## The CLI

```bash
node bin/vespasian.mjs <command>
```

| Command | What it does |
| --- | --- |
| `init` | The setup wizard (same as `pnpm run init`) |
| `login --editor` | Consent prompt + one-time **headed** Wix login; persists the session to `.vespasian/session/state.json` ([details](wix/editor-automation.md)) |
| `site create <name>` | Provision a new site from a confirmed-Studio template (`--template-id <guid>`); asserts `editorType == WIX_STUDIO`; writes `WIX_SITE_ID` |
| `site use <id>` | Select an existing site as the default target |
| `site list` | List the account's sites with IDs |
| `pipeline indesign <input> [--plan <out>]` | InDesign `.idml`/PDF → BuildPlan ([guide](pipelines/indesign.md)). Figma/Canva conversions are driven through Claude Code instead |
| `plan <ir>` | Compile a BuildPlan from a pipeline IR artifact |
| `apply <plan>` | Execute a BuildPlan against the target site. `--dry-run` rehearses with recording transports; `--resume-from <phase>` continues from a checkpoint (`provision`, `media`, `data`, `editor`, `code`, `properties`, `publish`, `qa`) |
| `publish` | Publish the site (REST; use the Wix CLI path when code shipped) |
| `qa` | Screenshot the published site at representative Studio-breakpoint widths (1280/900/375); with `--expect <file>`, assert computed theme CSS variables. The FidelityReport is written by `apply`; pixel-diffing vs the design is `scripts/visual-diff.js` / the visual-qa agent |

Global behavior:

- `VESPASIAN_DRY_RUN=1` makes **every** command run against no-op recording transports — no Wix
  calls, no credentials needed. `apply --dry-run` is the per-invocation equivalent.
- Configuration is layered: CLI flags → `vespasian.config.json`
  ([example](../vespasian.config.example.json)) → `.env` defaults.
- All state (plans, checkpoints, session, dry-run recordings) lives under `.vespasian/` —
  gitignored, safe to delete when you want a clean slate (you'll need to `login --editor` again).

Run `node bin/vespasian.mjs --help` (or `<command> --help`) for the authoritative flag lists.
