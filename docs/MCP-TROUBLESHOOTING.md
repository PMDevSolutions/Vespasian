# MCP (Model Context Protocol) Troubleshooting Guide

**Troubleshooting for Vespasian's MCP servers.** Setup instructions live in
[mcp-setup.md](mcp-setup.md).

---

## Quick Reference

| Issue | Quick fix | Section |
|-------|-----------|---------|
| Figma MCP connection refused | Open Figma Desktop + enable Dev Mode | [3.1](#31-cannot-connect-to-figma-desktop-mcp) |
| Playwright browser not found | Run `./scripts/setup-playwright.sh` | [5.1](#51-browser-not-installed) |
| `.mcp.json` syntax error | Validate with `python3 -m json.tool .mcp.json` | [2.1](#21-validating-mcpjson-syntax) |
| Figma authentication failed | Re-authenticate (whoami) / refresh token | [4.1](#41-authentication-failed-401403) |
| Editor automation opens logged-out browser | Session expired — `vespasian login --editor` | [5.4](#54-editor-session-problems) |
| MCP server timeout | First `npx` run downloads packages; retry | [6.2](#62-handling-mcp-timeouts) |

### Quick diagnostic

```bash
./scripts/check-mcp.sh
```

---

## 1. Understanding MCP in this project

MCP servers expose tools Claude Code can invoke. Vespasian configures three in
[`.mcp.json`](../.mcp.json):

| Server | Type | Purpose | URL/Command |
|--------|------|---------|-------------|
| **figma-desktop** | HTTP | Design extraction via the desktop app | `http://127.0.0.1:3845/mcp` |
| **figma** | HTTP | Remote Figma fallback | `https://mcp.figma.com/mcp` |
| **playwright** | Command | QA screenshots + the **agent-visual plane of Wix editor automation** | `npx @playwright/mcp@latest --headless` |

The Playwright MCP matters more here than in most projects: canvas composition in the Wix editor
is executed through it by the `wix-site-builder` agent
([wix/editor-automation.md](wix/editor-automation.md)). The optional official **Wix MCP**
(`https://mcp.wix.com/mcp`, same API-key headers as the REST plane) is documented in
[mcp-setup.md](mcp-setup.md#optional-the-official-wix-mcp) but not shipped by default.

## 2. Verifying MCP configuration

### 2.1 Validating .mcp.json syntax

```bash
python3 -m json.tool .mcp.json          # or: node -e "JSON.parse(require('fs').readFileSync('.mcp.json'))"
```

A single trailing comma breaks **all** servers. Each server name must be unique.

### 2.2 Checking what Claude Code sees

Run `claude` in the project root, then `/mcp` to list connected servers and their tools. A server
missing from the list means a config or startup error — run the underlying command manually to see
it (e.g. `npx -y @playwright/mcp@latest --headless`).

## 3. Figma Desktop MCP issues

### 3.1 Cannot connect to Figma Desktop MCP

**Symptoms:** `ECONNREFUSED 127.0.0.1:3845`, or the server never appears.

**Fixes:**
1. Open **Figma Desktop** (not the web app).
2. Enable **Dev Mode** — the `</>` toggle (Professional+ plan required).
3. Have at least one file open.
4. Check the port: `curl -s http://127.0.0.1:3845/mcp` — if blocked, look at firewall rules.
5. Restart Figma Desktop if the port was recently freed.

### 3.2 Tokens extract but are empty/partial

The file uses raw styles instead of published variables — publish variables/styles in Figma, or
accept per-node sampling (lower provenance, flagged in the pipeline report).

## 4. Figma Remote MCP issues

### 4.1 Authentication failed (401/403)

1. Re-authenticate via the OAuth prompt.
2. Token users: verify the `FIGMA_PERSONAL_ACCESS_TOKEN` hasn't expired (Figma → Account
   Settings) and has file read scope.
3. Rate limits: the remote MCP may throttle — back off and retry.

## 5. Playwright MCP issues

### 5.1 Browser not installed

**Symptoms:** `browserType.launch: Executable doesn't exist`.

```bash
./scripts/setup-playwright.sh        # or: npx playwright install chromium
npx playwright install-deps          # Linux system deps
```

### 5.2 npx not found (Windows, Claude Desktop only)

The project `.mcp.json` uses a cross-platform `"command": "npx"` entry that works in Claude Code.
If Claude *Desktop* on Windows can't resolve `npx`, wrap it:
`"command": "cmd", "args": ["/c", "npx", "-y", "@playwright/mcp@latest", "--headless"]`.

### 5.3 Headless vs headed confusion

- **QA screenshots of published sites** → headless is fine (the default entry).
- **Wix editor automation** → must run **headed** with the persisted session:
  `npx @playwright/mcp@latest --storage-state .vespasian/session/state.json` (no `--headless`).
  Headless editor sessions raise CAPTCHA/challenge risk and are unsupported as a default.

### 5.4 Editor session problems

**Symptoms:** the browser opens on a Wix login page; editor tools act on a logged-out state.

1. The session expired or the storage-state path is wrong — re-run
   `node bin/vespasian.mjs login --editor` and confirm `WIX_EDITOR_STORAGE_STATE` matches the
   `--storage-state` the MCP server was started with.
2. Never try to script past a CAPTCHA/2FA — complete it by hand in the headed window (designed
   human-in-the-loop pause).
3. Selector drift inside the editor is not an MCP problem — see
   [COMMON-FAILURES-FIXES.md §3.3](COMMON-FAILURES-FIXES.md#33-editor-step-cant-find-its-panel).

## 6. General MCP debugging

### 6.1 Server not appearing

1. Restart Claude Code (or Claude Desktop) after config edits.
2. Validate JSON syntax (§2.1).
3. Run the server command manually in a terminal and read its stderr.

### 6.2 Handling MCP timeouts

1. First-time `npx` runs download packages — subsequent runs are fast.
2. Check network access (remote Figma, package downloads).
3. For long editor-automation sessions, keep the headed window visible and unminimized; some
   platforms throttle background windows.

### Need more help?

- Setup guide: [mcp-setup.md](mcp-setup.md)
- Validation script: `./scripts/check-mcp.sh`
- Claude Code MCP docs: [docs.anthropic.com](https://docs.anthropic.com/en/docs/claude-code/mcp)
