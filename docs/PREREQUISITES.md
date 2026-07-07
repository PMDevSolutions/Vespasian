# Prerequisites

Everything Vespasian needs, with verify commands and per-OS install notes.
Run the automated check any time:

```bash
./scripts/check-prerequisites.sh
```

There is deliberately **no Docker, no PHP, no Composer, and no local server** in this list — the
build target is a remote Wix site.

## Required

### 1. Git

Version control; also used by the Wix CLI channel (the site's Git-integration repo).

```bash
git --version    # any modern version
```

Install: [git-scm.com](https://git-scm.com/) · macOS: `xcode-select --install` or `brew install git` · Windows: Git for Windows (includes Git Bash, which the GUI uses to run `.sh` scripts) · Linux: `apt install git` / `dnf install git`.

### 2. Node.js 20+

Runs the CLI, pipelines, Playwright, and the GUI.

```bash
node -v          # must be ≥ v20
```

Install: [nodejs.org](https://nodejs.org/) LTS, or a version manager (`nvm install 20`, `fnm use 20`). The repo's `.npmrc` sets `engine-strict=true` — installs fail loudly on an old Node.

### 3. pnpm 9.x

Workspace package manager.

```bash
corepack enable  # ships with Node; activates the pinned pnpm
pnpm -v          # 9.x
```

### 4. Claude Code

The conversion engine for the Figma and Canva pipelines, and the agent layer for canvas
composition.

```bash
npm install -g @anthropic-ai/claude-code
claude --version
```

Docs: [claude.ai/code](https://claude.ai/code). MCP server setup (Figma + Playwright):
[mcp-setup.md](mcp-setup.md).

### 5. A Wix account with a Studio workspace

Vespasian builds **Wix Studio** sites exclusively (v1) — Studio is the only Wix editor flavor with
custom CSS, responsive breakpoints, and section grids
([why](wix/ARCHITECTURE.md#product-decision-wix-studio-first)).

- Sign up / convert at [wix.com/studio](https://www.wix.com/studio) (free to create; scratch sites
  cost nothing).
- Verify: [manage.wix.com](https://manage.wix.com) shows a Studio workspace.

### 6. An account-level Wix API key

The primary auth plane — used for site creation, media, CMS data, embeds, properties, and publish.

1. Go to [manage.wix.com/account/api-keys](https://manage.wix.com/account/api-keys) (you must be
   the **account owner**).
2. Create a key with at least these permission sets: Projects/Site creation, Site Actions, Read
   Site URLs, Manage Media Manager, Manage Data Collections + Write Data Items, Manage Custom
   Embeds, Manage Business Profile, Manage SEO Settings.
3. Put it in `.env` as `WIX_API_KEY`, with your account GUID as `WIX_ACCOUNT_ID`
   (`pnpm run init` does this for you).

> **Important:** the key is scoped to your whole account — treat it like a root credential
> ([SECURITY.md](../SECURITY.md)). Site-level calls only work with a key from the **site owner's**
> account, not a co-owner's.

Verify:

```bash
./scripts/wix-environment-manager/check-environment.sh   # env vars + API reachability
```

## Optional

### 7. Playwright browsers

Needed for QA screenshots and (if you enable it) editor automation. Installed on demand, or
explicitly:

```bash
./scripts/setup-playwright.sh        # or: pnpm playwright:install
```

### 8. Wix CLI

Only needed for the code channel (`global.css`, Velo files) on Git-connected sites.

```bash
npm install -g @wix/cli
wix --version
```

Docs: [Wix CLI](https://dev.wix.com/docs/dev-center/build-your-own-apps/developer-tools/cli/get-started).
API-key auth for CI is documented but thinly verified — keep interactive `wix login` as the
fallback.

### 9. A dedicated Wix-native login for editor automation

Only needed if you enable the editor plane (`vespasian login --editor`). Requirements:

- A **Wix-native email+password** account (Google SSO cannot be automated) — ideally dedicated to
  Vespasian, added as a collaborator or owner of the target sites.
- You will complete the login (and any CAPTCHA/2FA) **yourself, once, in a headed browser**; the
  session persists to `.vespasian/session/state.json`.
- `WIX_EDITOR_TOTP_SECRET` is **reserved — not implemented in v0.1**: session expiry always pauses
  for a human login (by design).

Read [editor-automation.md](wix/editor-automation.md) — including the ToS-gray-area consent —
before enabling this.

### 10. Figma Professional+ (Figma input only)

Design-token extraction uses Dev Mode, which requires a paid plan.

- Verify: open your file in the Figma **desktop** app and toggle Dev Mode (`</>`).
- Configure the Figma MCP per [mcp-setup.md](mcp-setup.md).
- Skip entirely if your input is Canva or InDesign.

## Environment file

All configuration lives in `.env` (created by `pnpm run init` from `.env.example`):

```
WIX_API_KEY / WIX_ACCOUNT_ID                  # required (API plane)
WIX_SITE_ID                                   # optional; written by `vespasian site create|use`
WIX_METASITE_ID                               # optional; cached for dashboard/editor URLs
WIX_EDITOR_STORAGE_STATE / WIX_EDITOR_HEADLESS
WIX_EDITOR_SLOWMO_MS                          # optional (editor plane)
WIX_EDITOR_TOTP_SECRET                        # reserved — not implemented in v0.1
VESPASIAN_DRY_RUN                             # =1 to run with zero credentials
```

`.env` and the `.vespasian/` state directory are gitignored — credentials can't be committed by
default.

## Verify everything at once

```bash
./scripts/check-prerequisites.sh                         # tools
./scripts/wix-environment-manager/check-environment.sh   # credentials, API reachability, session freshness
./scripts/check-mcp.sh                                   # MCP servers (Figma, Playwright)
```
