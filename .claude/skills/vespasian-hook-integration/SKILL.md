---
name: vespasian-hook-integration
description: Use when creating Claude Code agent hooks, implementing PreToolUse or PostToolUse patterns, or integrating Vespasian pipeline workflows with custom agents in this template. Keywords: agent hooks, PreToolUse, PostToolUse, Claude Code hooks, custom agents, workflow automation, Vespasian automation
---

# Vespasian Hook Integration for Claude Code Agents

## Overview

Claude Code agent hooks execute shell scripts before/after tool use. This template uses hooks to enforce project conventions (no WordPress-era output paths, token discipline), validate generated BuildPlan artifacts, and nudge the quality gates during the design-to-Wix pipeline.

**Core Principle:** hooks automate quality enforcement and project rules without manual intervention. They warn or block based on severity.

## When to Use

Use this skill when:
- Creating hooks for custom agents in this template
- Adding validation to the design-to-Wix conversion pipeline
- Enforcing project conventions (output locations, token usage)
- Understanding or modifying existing hook behavior

**Symptoms that trigger this skill:** "create hook" · "agent hook" · "PreToolUse" · "PostToolUse" · "validate the plan artifact" · "hook isn't firing"

## Current Hook Architecture

Three script hooks live in `.claude/hooks/`:

```
.claude/hooks/
├── validate-output-location.sh   # PreToolUse (registered): blocks writes to themes//plugins//wp-content/
├── figma-wix-post-page.sh        # Manual (invoked by the workflow skills): per-artifact validation
└── figma-wix-completion.sh       # Manual: BuildPlan summary + token audit + completion report
```

Plus six **inline** PostToolUse hooks registered in `.claude/settings.json` (post-build-qa, pre-commit-guard, coverage-check, dark-mode-reminder, bundle-guard, mutation-test). Only `validate-output-location.sh` and the six inline hooks are auto-registered; the two figma-wix scripts are invoked manually by the conversion skills — preserve that contract when editing settings.json, or register them explicitly and say so.

### Hook 1: validate-output-location.sh (PreToolUse, registered)

**Purpose:** Vespasian's output is a live Wix site — blocks any Write/Edit targeting the WordPress-era directories (`themes/`, `plugins/`, `mu-plugins/` at root, `wp-content/` anywhere) and points to the correct locations (`.vespasian/plans/`, `packages/`).

**Exit codes:** `0` allow · `2` block (with a corrected-location suggestion on stderr).

### Hook 2: figma-wix-post-page.sh (manual, warn-only)

**Purpose:** validates each generated artifact under `.vespasian/plans/` during conversion: JSON syntax, stray-hex audit (colors belong in tokens, not content), delegation to `scripts/wix-structure-validator/validate-structure.sh` when present. Always exits 0.

```bash
echo '{"tool_input":{"file_path":".vespasian/plans/my-site/content.json"}}' \
  | bash .claude/hooks/figma-wix-post-page.sh
# or: bash .claude/hooks/figma-wix-post-page.sh .vespasian/plans/my-site/plan.json
```

### Hook 3: figma-wix-completion.sh (manual)

**Purpose:** runs when a conversion finishes compiling its BuildPlan. Summarizes steps by phase/channel, counts FidelityNotes, audits `global.css` for hex outside `--vsp-*` definitions, runs `scripts/validate-site.sh` if present, and writes a markdown report to `.claude/reports/`.

```bash
bash .claude/hooks/figma-wix-completion.sh .vespasian/plans/my-site/plan.json
```

## Hook Types

| Hook Type | When It Runs | Exit Code Behavior |
|-----------|--------------|-------------------|
| **PreToolUse** | Before tool execution | `0` = allow, `2` = block |
| **PostToolUse** | After tool execution | `0` = success (warnings OK), non-zero = report issue |

## Creating New Hooks

### Input Format

Hooks receive JSON on stdin from Claude Code:

```json
{
  "tool_name": "Write",
  "tool_input": {
    "file_path": ".vespasian/plans/my-site/content.json",
    "content": "..."
  }
}
```

Extract values with `jq`:
```bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
```

Inline PostToolUse hooks on the Bash matcher instead receive `$TOOL_INPUT` / `$TOOL_OUTPUT` environment variables — grep those (see settings.json for six working examples).

### Pattern: Blocking Hook (PreToolUse)

```bash
#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -z "$FILE_PATH" ] && exit 0

if [[ "$FILE_PATH" =~ some-bad-pattern ]]; then
    echo "BLOCKED: reason + suggested correct location" >&2
    exit 2
fi
exit 0
```

### Pattern: Warning Hook (PostToolUse / manual)

```bash
#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
[[ ! "$FILE_PATH" =~ \.vespasian/plans/.*\.json$ ]] && exit 0

echo "Running check on $FILE_PATH..." >&2
# ... validation logic ...
exit 0   # always 0: warn, don't block
```

## Hook Best Practices

1. **Output to stderr** — use `>&2` for all echo statements (stdout is reserved for Claude Code)
2. **Fast execution** — hooks should complete in < 5 seconds
3. **Read from stdin** — Claude Code passes tool input as JSON on stdin
4. **Use jq for parsing** — `jq -r '.tool_input.field // empty'`
5. **Exit 0 for warnings** — only use exit 2 for hard blocks (PreToolUse)
6. **Filter by file path early** — exit 0 immediately if not relevant
7. **Idempotent** — safe to run multiple times on the same input
8. **Portable** — no GNU-only flags (`find -printf` broke the old completion hook on macOS; use `ls -t` or `stat`)

## Scoping Hooks to Workflows

All hooks run for every agent. Use file-path patterns and tool-name checks to scope:

```bash
# Only for pipeline artifacts
[[ ! "$FILE_PATH" =~ \.vespasian/plans/.*\.json$ ]] && exit 0

# Only for translate output
[[ ! "$FILE_PATH" =~ global\.css$ ]] && exit 0

# Only for wix-driver source
[[ ! "$FILE_PATH" =~ packages/wix-driver/src/ ]] && exit 0
```

This template ships 53 custom agents; hooks are the shared enforcement layer across all of them.

## Testing Hooks

```bash
# Blocked path → exit 2
echo '{"tool_input":{"file_path":"themes/test/style.css"}}' | bash .claude/hooks/validate-output-location.sh; echo $?

# Valid path → exit 0
echo '{"tool_input":{"file_path":".vespasian/plans/test/plan.json"}}' | bash .claude/hooks/validate-output-location.sh; echo $?

# Completion hook against a fixture plan
bash .claude/hooks/figma-wix-completion.sh .claude/templates/pipeline/example-buildplan.json
```

## No Exceptions

**NEVER create hooks that:**

1. Run for extended periods (> 10 seconds) without user notification
2. Modify files without user knowledge
3. Make network requests without disclosure — and never to `wixapis.com` (hooks must respect `VESPASIAN_DRY_RUN` semantics: validation is local)
4. Block critical operations silently
5. Ignore error conditions
6. Run destructive operations without confirmation

---

**Skill Version:** 3.0.0 (Wix target)
**Last Updated:** 2026-07-06
