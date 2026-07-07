---
name: wix-cli-workflows
description: Use when operating on Wix sites from the command line - the wix CLI (Git integration, global.css, Velo code), raw REST recipes with curl (auth headers, sites, editor URLs, media upload, CMS data, publish), and the vespasian CLI. Keywords: wix CLI, Wix REST API, curl, wixapis.com, API key, media upload, wix-data, publish, site list
---

# Wix CLI Workflows

## Overview

Command-line recipes for every Wix operation Vespasian scripts: the **`vespasian` CLI** (the porcelain), the **official `wix` CLI** (Git integration: `global.css` + Velo code), and **raw REST calls** with `curl` against `www.wixapis.com` (the plumbing the `packages/wix-driver/src/rest/` client wraps).

The authoritative per-operation matrix (endpoint · channel · fallback) is `docs/wix/API-COVERAGE.md` — this skill is the runnable-commands companion.

## Safety Conventions (non-negotiable)

- **Always rehearse destructive or bulk operations first:** `VESPASIAN_DRY_RUN=1` / `vespasian apply --dry-run` turn both transports into recorders.
- **Never put keys on the command line in shared shells** — read from `.env` (`set -a; source .env; set +a`).
- **Respect 429s:** the driver backs off 60s automatically; in ad-hoc curl loops, sleep on 429 instead of retrying hot.
- **Publish is production:** it flips the saved revision live, and there is **no revision-revert API**. Gate it (`.claude/config/deployment/`).

## Auth: the headers

Account-level API key (create at `manage.wix.com/account/api-keys`), sent as:

```bash
# Account-scoped calls (site list, create site):
-H "Authorization: $WIX_API_KEY" -H "wix-account-id: $WIX_ACCOUNT_ID"

# Site-scoped calls (media, data, publish, editor URLs):
-H "Authorization: $WIX_API_KEY" -H "wix-site-id: $WIX_SITE_ID"
```

**Exactly one** of `wix-account-id` / `wix-site-id` per call — sending both (or the wrong one) is the most common 403 cause.

## vespasian CLI (porcelain)

```bash
vespasian init                                   # interactive setup wizard
vespasian login --editor                         # one-time consented editor session
vespasian site create|use|list                   # provision / select / enumerate sites
vespasian pipeline indesign <input> [--plan <o>] # design → BuildPlan (figma/canva run via Claude Code)
vespasian plan <ir-dir>                          # compile a BuildPlan
vespasian apply <plan> [--dry-run|--resume-from <phase>]
vespasian publish
vespasian qa                                     # screenshots + FidelityReport
```

## REST recipes (curl)

Set up once:

```bash
set -a; source .env; set +a
WIX="https://www.wixapis.com"
```

### Sites

```bash
# List sites in the account
curl -s -X POST "$WIX/site-list/v2/sites/query" \
  -H "Authorization: $WIX_API_KEY" -H "wix-account-id: $WIX_ACCOUNT_ID" \
  -H "Content-Type: application/json" -d '{"query":{}}' | jq '.sites[] | {id, displayName}'
```

Site creation from a template and cloning go through the projects/sites families — use `vespasian site create`, which also **asserts the new site is Studio** (`editorType == WIX_STUDIO`) and caches `WIX_SITE_ID`/`WIX_METASITE_ID` for you.

### Editor URLs + editor type (never template URLs by hand)

```bash
curl -s "$WIX/editor-urls/v2/editor-urls" \
  -H "Authorization: $WIX_API_KEY" -H "wix-site-id: $WIX_SITE_ID" \
  | jq '{editorUrl, previewUrl, editorType}'
# editorType: WIX_STUDIO | WIX_EDITOR | ODEDITOR | WIXEL | EDITORLESS
```

### Media (upload → poll file-ready)

```bash
# 1. Request an upload URL
UPLOAD=$(curl -s -X POST "$WIX/site-media/v1/files/generate-upload-url" \
  -H "Authorization: $WIX_API_KEY" -H "wix-site-id: $WIX_SITE_ID" \
  -H "Content-Type: application/json" \
  -d '{"mimeType":"image/jpeg","fileName":"hero-group-photo.jpg"}')

# 2. PUT the bytes to .uploadUrl (plain HTTP upload)

# 3. Poll the file descriptor until operationStatus is READY before referencing it
curl -s "$WIX/site-media/v1/files/<fileId>" \
  -H "Authorization: $WIX_API_KEY" -H "wix-site-id: $WIX_SITE_ID" | jq '.file.operationStatus'
```

Never place media that has not reached file-ready — see `wix-media-first-architecture`.

### CMS data (collections + items)

```bash
# Insert an item
curl -s -X POST "$WIX/wix-data/v2/items" \
  -H "Authorization: $WIX_API_KEY" -H "wix-site-id: $WIX_SITE_ID" \
  -H "Content-Type: application/json" \
  -d '{"dataCollectionId":"TeamMembers","dataItem":{"data":{"name":"Ada","role":"Engineer"}}}'

# Query items
curl -s -X POST "$WIX/wix-data/v2/items/query" \
  -H "Authorization: $WIX_API_KEY" -H "wix-site-id: $WIX_SITE_ID" \
  -H "Content-Type: application/json" \
  -d '{"dataCollectionId":"TeamMembers","query":{}}' | jq '.dataItems | length'
```

Collection creation, custom embeds (head/body snippets), site properties, and robots/llms.txt follow the same header pattern — exact endpoints per family are tabulated in `docs/wix/API-COVERAGE.md` and wrapped in `packages/wix-driver/src/rest/{data,embeds,properties,seoFiles}.js`. Updates are **revision-aware**: read, carry the revision, write — a stale revision is a 409, not a retry-harder.

### Publish

```bash
# Prefer the porcelain (runs the configured publish gate):
vespasian publish

# Verify by fetching the public URL — never trust a modal or a 200 alone:
curl -sI "https://<account>.wixstudio.io/<site>" | head -1
```

## wix CLI (Git integration: global.css + Velo)

The **CLI channel** is how custom CSS and Velo code reach a Studio site — and only **after pages exist** in the editor (the executor orders the code phase after the editor phase).

```bash
npm i -g @wix/cli
wix login                       # browser-based CLI auth (separate from the API key)
wix --help                      # subcommands move; trust the CLI's own help over docs

# Typical cycle against a Studio site with Git integration enabled:
#   1. clone/pull the site's code repo
#   2. edit src/styles/global.css  (--vsp-space-* vars, .vsp-* utilities, .vsp-text-* overflow)
#   3. edit Velo page/backend files if needed
#   4. push — the Git integration syncs the site; publish still goes through the API gate
```

`packages/wix-driver/src/cli/` wraps this: it shells out only when `git`/`wix` exist, and otherwise returns the runnable instructions for you to execute.

## Debugging quick table

| Symptom | Cause | Fix |
|---|---|---|
| 401 | Bad/expired API key | Regenerate at manage.wix.com/account/api-keys |
| 403 | Wrong or doubled id header | Exactly one of `wix-account-id`/`wix-site-id`, matching the call's scope |
| 404 on a family | Site lacks the app (e.g. CMS not enabled) | Enable the feature on the site, or check the endpoint path |
| 409 on update | Stale revision | Re-read, merge, re-write with the fresh revision |
| 429 | Rate limit | Back off 60s; batch instead of hammering |
| Upload OK, file unusable | Skipped file-ready poll | Poll `operationStatus` until READY |

## Integration

- **Skills:** `wix-site-development` (channel decisions), `wix-media-first-architecture` (media discipline), `wix-playwright-driver` (the operations with no API at all)
- **Agents:** `wix-environment-manager` (env checks: `scripts/wix-environment-manager/check-environment.sh`), `deployment-agent` (`scripts/wix-deployment/`)
- **Code:** `packages/wix-driver/src/rest/` (the typed client these curls mirror), `src/cli/`

---

**Skill Version:** 1.0.0 (replaces wp-cli-workflows)
**Last Updated:** 2026-07-06
