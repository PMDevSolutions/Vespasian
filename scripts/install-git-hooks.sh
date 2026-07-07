#!/bin/bash
# Install git hooks for this project
# Run once: ./scripts/install-git-hooks.sh
#
# Installs a pre-commit hook that:
#   * blocks committing secrets (.env, .vespasian/ state, editor sessions)
#   * syntax-checks staged shell scripts (bash -n) and JS modules (node --check)
#   * validates staged JSON parses, with full plan-lint for BuildPlans
#   * warns on literal hex colors introduced into the token translator

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS_DIR="$PROJECT_ROOT/.git/hooks"

if [ ! -d "$HOOKS_DIR" ]; then
    echo "Error: .git/hooks directory not found. Are you in a git repository?"
    exit 1
fi

cat > "$HOOKS_DIR/pre-commit" << 'HOOK'
#!/bin/bash
# Pre-commit hook: Vespasian hygiene checks on staged files
# Installed by: ./scripts/install-git-hooks.sh

PROJECT_ROOT="$(git rev-parse --show-toplevel)"
ALL_STAGED=$(git diff --cached --name-only --diff-filter=ACM)
ERRORS=0

# ── Block secrets and local state ──
if echo "$ALL_STAGED" | grep -qE '(^|/)\.env$'; then
    echo "Error: .env is staged — never commit credentials." >&2
    ERRORS=$((ERRORS + 1))
fi
if echo "$ALL_STAGED" | grep -qE '^\.vespasian/'; then
    echo "Error: .vespasian/ state is staged (plans/checkpoints/session are local-only)." >&2
    ERRORS=$((ERRORS + 1))
fi

# ── Block WordPress-style output locations (fork-ancestor muscle memory) ──
if echo "$ALL_STAGED" | grep -qE '^(wp-content|themes|plugins|mu-plugins)/'; then
    echo "Error: WordPress-style paths staged. Vespasian output is a live Wix site;" >&2
    echo "  local artifacts belong in .vespasian/ (gitignored) or packages/." >&2
    ERRORS=$((ERRORS + 1))
fi

# ── Shell syntax check ──
for f in $(echo "$ALL_STAGED" | grep '\.sh$'); do
    if [ -f "$PROJECT_ROOT/$f" ] && ! bash -n "$PROJECT_ROOT/$f" 2>/dev/null; then
        echo "Error: bash syntax error in $f" >&2
        bash -n "$PROJECT_ROOT/$f" 2>&1 | head -3 >&2
        ERRORS=$((ERRORS + 1))
    fi
done

# ── JS syntax check ──
if command -v node >/dev/null 2>&1; then
    for f in $(echo "$ALL_STAGED" | grep -E '\.(mjs|js)$'); do
        if [ -f "$PROJECT_ROOT/$f" ] && ! node --check "$PROJECT_ROOT/$f" 2>/dev/null; then
            echo "Error: JS syntax error in $f" >&2
            ERRORS=$((ERRORS + 1))
        fi
    done
fi

# ── JSON validity (+ plan-lint for BuildPlans) ──
for f in $(echo "$ALL_STAGED" | grep '\.json$'); do
    [ -f "$PROJECT_ROOT/$f" ] || continue
    case "$f" in
        # Committed intentionally-invalid test fixtures
        tests/fixtures/*invalid*) continue ;;
    esac
    if command -v jq >/dev/null 2>&1; then
        if ! jq empty "$PROJECT_ROOT/$f" 2>/dev/null; then
            echo "Error: invalid JSON in $f" >&2
            ERRORS=$((ERRORS + 1))
            continue
        fi
    fi
    if echo "$f" | grep -qE '\.plan\.json$|/plans/.+\.json$'; then
        if [ -x "$PROJECT_ROOT/scripts/shared/plan-lint.sh" ] && \
           ! "$PROJECT_ROOT/scripts/shared/plan-lint.sh" "$PROJECT_ROOT/$f" >/dev/null 2>&1; then
            echo "Error: BuildPlan lint failed for $f (run scripts/shared/plan-lint.sh $f)" >&2
            ERRORS=$((ERRORS + 1))
        fi
    fi
done

# ── Design-token guard: new literal hex in the token translator ──
for f in $(echo "$ALL_STAGED" | grep -E '^packages/wix-driver/src/translate/.*\.js$'); do
    if [ -f "$PROJECT_ROOT/$f" ]; then
        NEW_HEX=$(git diff --cached -U0 -- "$f" | grep -E '^\+' | grep -cE '#[0-9A-Fa-f]{6}\b' || true)
        if [ "${NEW_HEX:-0}" -gt 0 ]; then
            echo "Warning: $f adds $NEW_HEX literal hex color(s) — translator output should derive from tokens" >&2
        fi
    fi
done

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo "Commit blocked: $ERRORS issue(s) found. Fix before committing." >&2
    exit 1
fi

exit 0
HOOK

chmod +x "$HOOKS_DIR/pre-commit"
echo "Pre-commit hook installed successfully."
echo "It blocks committed secrets/state, syntax errors, and invalid BuildPlans."
echo ""
echo "To bypass (emergency only): git commit --no-verify"
