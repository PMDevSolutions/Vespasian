# Lint

Run linting and formatting checks across the Vespasian Node/TypeScript workspace.

## Purpose

Keep the pnpm workspace (`packages/pipeline`, `packages/wix-driver`, `packages/gui`, `bin/`, `scripts/`) consistent: syntax-valid ESM, clean formatting, valid JSON/YAML configs, and shell scripts that parse.

## Usage

```
/lint
```

## What this command does

1. **Syntax-checks every touched `.mjs`/`.js`** with `node --check`
2. **Runs ESLint** where a config exists (the GUI package ships one)
3. **Validates JSON configs** (`.mcp.json`, `.claude/settings.json`, `package.json`, plan fixtures)
4. **Parses shell scripts** with `bash -n`

## Example Commands

### Node syntax check (fast, zero-config)
```bash
# Check a single file
node --check packages/wix-driver/src/plan/compile.js

# Check everything outside node_modules
find packages bin scripts -name '*.mjs' -o -name '*.js' | grep -v node_modules | while read -r f; do node --check "$f" || echo "FAIL: $f"; done
```

### ESLint (GUI package)
```bash
pnpm --filter @vespasian/gui lint     # eslint via the package script
npx eslint packages/gui/src           # or directly
```

### JSON validation
```bash
node -e 'JSON.parse(require("fs").readFileSync(".claude/settings.json","utf8")); console.log("ok")'
node -e 'JSON.parse(require("fs").readFileSync(".mcp.json","utf8")); console.log("ok")'
```

### Shell scripts
```bash
# Parse-check all shell scripts
find scripts .claude/hooks .claude/validation -name '*.sh' -exec bash -n {} \;

# Deeper static analysis if shellcheck is installed
shellcheck scripts/**/*.sh
```

### TypeScript (GUI only — the rest of the workspace is plain ESM)
```bash
pnpm --filter @vespasian/gui exec tsc --noEmit
```

## Best Practices

- Run `/lint` before committing; commitlint enforces conventional commit messages separately
- Never hand-edit generated artifacts under `.vespasian/` — fix the pipeline instead
- Keep files ESM (`type: module`); CommonJS `require()` in new code is a lint smell
- Do not add new lint toolchains (Prettier configs, etc.) without a workspace-level decision
