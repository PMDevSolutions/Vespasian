# Vespasian Setup: Post-Install Checklist

Work through this after cloning the repo and running `pnpm install`. When every box is checked you can convert a design into a live Wix Studio site.

---

## 1. Toolchain

- [ ] Node.js ≥ 20 (`node --version`)
- [ ] pnpm 9.x (`pnpm --version`)
- [ ] Workspace installed: `pnpm install`
- [ ] Shell-test libraries fetched: `git submodule update --init` (vendored bats under `tests/libs/`)
- [ ] CLI answers: `node bin/vespasian.mjs --help`
- [ ] Optional: the official Wix CLI for the code channel (`npm i -g @wix/cli`)

No Docker, no PHP, no composer, no WP-CLI — those belonged to the WordPress ancestor (Flavian).

## 2. Wix Account & Credentials

- [ ] A Wix account with a **Studio workspace** (Studio is the only supported editor flavor in v1)
- [ ] An **account-level API key** from [manage.wix.com/account/api-keys](https://manage.wix.com/account/api-keys)
- [ ] `.env` created (never committed) with:

```bash
WIX_API_KEY=...            # required
WIX_ACCOUNT_ID=...         # required
# WIX_SITE_ID=...          # optional; written by `vespasian site create|use`
# WIX_METASITE_ID=...      # optional; cached for dashboard/editor URLs
```

- [ ] Environment sanity check: `./scripts/wix-environment-manager/check-environment.sh` (env vars + API reachability + editor-session freshness)

## 3. Editor Automation (optional, consent-gated)

Only needed for editor-channel operations (pages, theme panels, canvas composition, font upload, per-page SEO). Skip if you are only rehearsing with dry-run.

- [ ] Preferably a dedicated **Wix-native email/password login** (not Google SSO) with access to the target sites
- [ ] Run the one-time headed login and accept the consent prompt:

```bash
vespasian login --editor
```

- [ ] Session saved at `.vespasian/session/state.json` (gitignored — never commit it)
- [ ] Understand the posture: editor automation is a Wix ToS gray area; it runs headed at human pace on your own account, CAPTCHAs/2FA always escalate to you, and session expiry is a designed pause. Details: `.claude/skills/wix-playwright-driver/SKILL.md`

Optional env knobs: `WIX_EDITOR_STORAGE_STATE`, `WIX_EDITOR_HEADLESS`, `WIX_EDITOR_SLOWMO_MS` (`WIX_EDITOR_TOTP_SECRET` is reserved — TOTP re-auth is not implemented in v0.1).

## 4. MCP Servers

`.mcp.json` ships three servers — enable them in your local settings (`enabledMcpjsonServers` in `.claude/settings.local.json`):

- [ ] `figma-desktop` (needs the Figma desktop app with Dev Mode) or `figma` (remote fallback)
- [ ] `playwright` — QA screenshots and the editor plane. For editor work, launch it with the saved session and headed: `npx @playwright/mcp@latest --storage-state .vespasian/session/state.json`

**Optional — official Wix MCP:** Wix operates a remote MCP server (`https://mcp.wix.com`) exposing API operations. It is deliberately NOT in `.mcp.json` (Vespasian's REST client covers the same surface deterministically), but you can add it yourself:

```json
"wix": { "type": "http", "url": "https://mcp.wix.com/mcp", "description": "Official Wix MCP (optional)" }
```

Remember to also add `"wix"` to `enabledMcpjsonServers`, or it silently stays disabled.

## 5. First Pipeline Run (dry-run — no Wix account touched)

- [ ] Rehearse apply against the bundled example plan:

```bash
VESPASIAN_DRY_RUN=1 vespasian apply .claude/templates/pipeline/example-buildplan.json --dry-run
```

- [ ] Run an InDesign fixture end-to-end (parse → tokens → plan):

```bash
node scripts/indesign-wix/smoke-test.mjs
```

- [ ] Test suites green:

```bash
pnpm -r test
./tests/libs/bats-core/bin/bats tests/unit/   # needs the §1 submodule step
```

## 6. First Real Site (optional)

```bash
vespasian site create "My First Site"            # asserts Studio editor, caches WIX_SITE_ID
vespasian pipeline indesign ./brochure.idml --slug brochure
vespasian apply .vespasian/plans/brochure/plan.json --dry-run   # always rehearse first
vespasian apply .vespasian/plans/brochure/plan.json
vespasian publish
vespasian qa                                     # published-site screenshots (+ --expect theme-var checks)
```

The pipeline prints the exact apply path in its `next:` hint — copy it from there if you changed
`--slug`/`--plan`. The FidelityReport is written by `vespasian apply`.

Figma/Canva conversions run through Claude Code conversationally — "Convert this Figma design to a Wix site" — see `.claude/skills/figma-to-wix-autonomous-workflow/`.

## 7. Guardrails Active After Setup

| Guardrail | Where |
|---|---|
| Blocks writes to WordPress-era dirs (`themes/`, `wp-content/`, ...) | `.claude/hooks/validate-output-location.sh` (PreToolUse) |
| Token-discipline + plan-size + QA reminders | 6 inline hooks in `.claude/settings.json` |
| Output-structure CI check | `.claude/validation/enforce-output-structure.sh` |
| Agent/skill config validation | `./scripts/validate-agent-configs.sh` |
| Deployment publish gates | `.claude/config/deployment/*.yml` (copy from `*.example.yml`) |

## 8. Inventory

- **Plugins:** 5 (episodic-memory, superpowers, github, commit-commands, ai-taskmaster) — `.claude/PLUGINS-REFERENCE.md`. If `php-lsp` is still installed from the WordPress era, uninstall it.
- **Skills:** 10 — `.claude/skills/README.md`
- **Commands:** 2 (`/lint`, `/test`) — `.claude/commands/`
- **Agents:** see `.claude/CUSTOM-AGENTS-GUIDE.md` for the current catalog (key Wix agents: figma-wix-converter, canva-wix-converter, indesign-to-wix, wix-site-builder, visual-qa-agent)

---

**You are set up when:** `check-environment.sh` passes, the dry-run apply succeeds, and (if you need editor automation) `vespasian login --editor` has a fresh consented session.
