# Claude Code Plugins Quick Reference

**Installed Plugins:** 4 user plugins + 1 local plugin
**Status:** Lean, Wix-pipeline-optimized configuration

## Currently Installed Plugins

**User Plugins (4):**
- `episodic-memory` - Conversation search and persistent memory (**load-bearing**: the conversion skills checkpoint through it)
- `commit-commands` - Git workflow automation
- `github` - GitHub integration
- `superpowers` - Advanced development workflows (**load-bearing**: the conversion skills plan/execute through `superpowers:writing-plans` / `superpowers:executing-plans`)

**Local Plugins (1):**
- `ai-taskmaster` - Task management and planning

**Removed in the Wix fork:**
- `php-lsp` - PHP language server. Vespasian contains no PHP; the plugin is dead weight and should be uninstalled (`/plugin uninstall php-lsp`). Optional replacement if you want richer code intelligence in `packages/gui` (TypeScript): a `typescript-lsp` plugin — not installed by default because the workspace is mostly plain ESM JavaScript and `node --check`/ESLint cover it.

---

## episodic-memory Plugin

### Purpose
Persistent memory across sessions — and the checkpoint store for long autonomous conversions.

### Vespasian Use Cases
- **Conversion checkpoints (critical):** the figma/canva workflow skills save a checkpoint every 3 pages (`/episodic-memory:save "Figma-to-Wix checkpoint: {slug}, {X} of {N} pages"`) so a multi-hour conversion survives interruption. Resumption searches for the checkpoint and jumps straight back into the page loop; apply-phase interruptions resume via the executor's own `.vespasian/checkpoints/` instead.
- Recalling past design decisions: "how did we map that client's palette last time?"

### Common Commands
```
/episodic-memory:save "..."      # save a memory/checkpoint
/episodic-memory:search "..."    # find past checkpoints/decisions
```

**Do not uninstall** — the autonomous workflows depend on it.

---

## superpowers Plugin

### Purpose
Structured planning and uninterrupted plan execution.

### Vespasian Use Cases
- `superpowers:writing-plans` — Phase 1 of every conversion: the implementation plan the user approves.
- `superpowers:executing-plans` — Phase 2: autonomous execution with no "should I continue?" prompts, through token extraction, artifact emission, `vespasian plan`, dry-run, and apply.

**Do not uninstall** — the autonomous workflows depend on it.

---

## github Plugin

### Purpose
GitHub integration for version control, pull requests, and issue management.

### Authentication Setup
**Required:** GitHub Personal Access Token (PAT)

1. Go to: https://github.com/settings/tokens/new
2. Select scopes: `repo`, `workflow`
3. Generate the token and configure it in Claude Code when prompted

### Common Commands
```bash
gh repo view                  # repository info
gh pr create --title "feat: compile CMS collections into the data phase" \
  --body "Adds wix-data collection steps to the BuildPlan compiler"
gh pr list
gh issue create --title "429 backoff too aggressive on media polling"
gh auth status
```

### Vespasian Workflow Example
```bash
git checkout -b feat/media-file-ready-poll
# ... edit packages/wix-driver/src/rest/media.js + tests ...
pnpm --filter @vespasian/wix-driver test
/commit
/commit-push-pr    # PR with test plan; CI runs the dry-run plan gate
```

---

## commit-commands Plugin

### Purpose
Structured git commits and PR automation.

### Common Commands
```
/commit           # conventional, structured commit (release-please reads these)
/commit-push-pr   # commit + push + PR in one flow
/clean_gone       # prune branches whose remotes are gone
```

### Notes for This Repo
- Conventional commits are required — release-please derives versions from them. **Never hand-bump versions.**
- The inline PostToolUse hooks fire around commits: pre-commit-guard (token discipline in translate output) and the plan-size bundle-guard.
- Never commit `.env`, `.vespasian/` state (session cookies live there), or real `*.yml` deployment configs.

---

## ai-taskmaster Plugin (local)

### Purpose
Task management and planning for multi-step work.

### Vespasian Use Cases
- Tracking multi-page conversion progress at the task level
- Sequencing pipeline work: parse → tokens → plan → apply → QA

---

## Plugin Management

```
/plugin list                  # list installed plugins
/plugin install <name>        # install
/plugin uninstall <name>      # uninstall (do this for php-lsp if still present)
```

## MCP Servers (related, configured in .mcp.json — not plugins)

| Server | Role |
|---|---|
| `figma-desktop` / `figma` | Design ingestion (tokens, structure, baselines) |
| `playwright` | QA screenshots + the consent-gated Wix editor automation plane |
| Wix MCP (optional, not configured by default) | Wix ships an official remote MCP (mcp.wix.com) exposing API operations; see `.claude/SETUP-COMPLETE.md` for how to add it |

---

**Last Updated:** 2026-07-06
