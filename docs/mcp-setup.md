# MCP Server Setup

**How Vespasian's MCP servers are configured — for Claude Code (the default) and Claude Desktop.**

---

## The servers

Vespasian ships three MCP servers in the project's [`.mcp.json`](../.mcp.json) (used by Claude
Code automatically):

| Server | Type | Purpose |
|--------|------|---------|
| **figma-desktop** | HTTP → `http://127.0.0.1:3845/mcp` | Design-token/structure extraction from the Figma desktop app (preferred) |
| **figma** | HTTP → `https://mcp.figma.com/mcp` | Remote Figma fallback |
| **playwright** | stdio → `npx @playwright/mcp@latest --headless` | Browser automation — QA screenshots **and the agent-visual plane of Wix editor automation** |

The Playwright MCP is **load-bearing** in Vespasian: the `wix-site-builder` agent drives canvas
composition in the Wix editor through it. For editor work it should run **headed** with the
persisted session — add `--storage-state .vespasian/session/state.json` and drop `--headless`
(see `.claude/skills/wix-playwright-driver/` and
[wix/editor-automation.md](wix/editor-automation.md)). The default headless entry is right for QA
screenshots of published sites.

### Optional: the official Wix MCP

Wix publishes an MCP server at `https://mcp.wix.com/mcp` that accepts the same API key +
`wix-account-id` headers as the REST plane (or interactive OAuth). Vespasian does **not** ship it
by default — the in-house REST client is the primary transport (typed, testable, identical
capability ceiling) — but it is a useful secondary for doc search and ad-hoc site queries from the
agent side. Add it to `.mcp.json` yourself if you want it; it shares every platform gap (no theme
write, no page composition).

## Prerequisites

- **Node.js 20+** with `npx` (for the Playwright MCP)
- **Figma Desktop** with Dev Mode enabled (for `figma-desktop` only)
- Playwright browsers: `./scripts/setup-playwright.sh` (or `pnpm playwright:install`)

## Claude Code (CLI) — nothing to do

Claude Code reads `.mcp.json` from the project root. Verify connectivity:

```bash
./scripts/check-mcp.sh
```

## Claude Desktop

Claude Desktop uses its own config file instead of `.mcp.json`:

| OS | Path |
|----|------|
| **Windows** | `%APPDATA%\Claude\claude_desktop_config.json` |
| **macOS** | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Linux** | `~/.config/Claude/claude_desktop_config.json` |

(Or: Claude Desktop → **Settings → Developer → Edit Config**.)

> **⚠️ Verified vs. unverified config.** The **verified** Figma MCP configuration is the HTTP
> transport in this project's `.mcp.json`: `figma-desktop` → `http://127.0.0.1:3845/mcp` and
> `figma` → `https://mcp.figma.com/mcp`. If your Claude Desktop build supports HTTP/remote MCP
> servers, use those URLs directly. The `@anthropic-ai/figma-mcp-server` stdio wrapper sometimes
> shown in examples is **unverified** (the package name is not confirmed to exist) — substitute a
> wrapper you have verified if your build needs stdio.

A working stdio example for the Playwright server:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest", "--headless"]
    }
  }
}
```

Options: drop `--headless` for a visible browser; `--browser chromium|firefox|webkit`;
`--storage-state <path>` to reuse the Vespasian editor session.

> **Windows note:** the project `.mcp.json` uses a plain `"command": "npx"` entry, which works
> cross-platform in Claude Code. If Claude *Desktop* on Windows can't resolve `npx`, wrap it:
> `"command": "cmd", "args": ["/c", "npx", "-y", "@playwright/mcp@latest", "--headless"]`.

## Verifying connections

1. **Claude Code:** `./scripts/check-mcp.sh` checks configuration and connectivity.
2. **Figma desktop:** open Figma Desktop, enable Dev Mode (`</>`), have a file open, then ask
   Claude: *"Use the Figma MCP to check who I am"*. If it fails: check nothing blocks
   `127.0.0.1:3845` (`curl -s http://127.0.0.1:3845/mcp`).
3. **Figma remote:** first use triggers an OAuth prompt; for CI/headless use a
   `FIGMA_PERSONAL_ACCESS_TOKEN` env var on the server entry (generate at Figma → Account
   Settings → Personal access tokens).
4. **Playwright:** ask Claude: *"Use Playwright to navigate to https://example.com and take a
   screenshot"*. If the browser is missing: `npx playwright install chromium` (Linux may also
   need `npx playwright install-deps`).

## Local vs remote/CI

| Server | Local dev | Remote/CI |
|--------|-----------|-----------|
| figma-desktop | ✅ preferred | ❌ needs the desktop GUI |
| figma (remote) | fallback | ✅ primary (token auth) |
| playwright | ✅ headed for editor automation, headless for QA | ✅ `--headless` only; **never** editor automation in CI (dry-run instead) |

More debugging: [MCP-TROUBLESHOOTING.md](MCP-TROUBLESHOOTING.md).
