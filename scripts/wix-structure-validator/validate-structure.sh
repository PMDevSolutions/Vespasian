#!/bin/bash
# Wix Structure Validator - PostToolUse hook + CLI
# Validates generated Wix build artifacts (BuildPlans, content models, page
# payloads) against the expected structure.
#
# Two modes:
#   *  Hook mode (no argument): reads PostToolUse JSON from stdin and pulls
#      .tool_input.file_path. Warn-only: exits 0 and reports issues to stderr;
#      the executor re-validates with zod at apply time.
#   *  CLI mode (first argument = a JSON file): validates that file directly
#      and exits nonzero when the plan is invalid.
#
# Applies to JSON artifacts under .vespasian/ (and *.plan.json anywhere):
#   *  .vespasian/plans/*.json  → full BuildPlan lint (scripts/shared/plan-lint.sh)
#   *  content.json             → pages[] shape sanity
#   *  tokens.json              → delegated to the design-token hooks (skipped here)

ARGV_MODE=false
if [[ -n "${1:-}" ]]; then
    ARGV_MODE=true
    FILE_PATH="$1"
    if [[ ! -f "$FILE_PATH" ]]; then
        echo "  ERROR: no such file: $FILE_PATH" >&2
        exit 2
    fi
else
    INPUT=$(cat)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

    # Only check JSON artifacts in the Vespasian state dir (or *.plan.json anywhere)
    if [[ ! "$FILE_PATH" =~ \.json$ ]]; then
        exit 0
    fi
    if [[ ! "$FILE_PATH" =~ (^|/)\.vespasian/ && ! "$FILE_PATH" =~ \.plan\.json$ ]]; then
        exit 0
    fi

    if [[ ! -f "$FILE_PATH" ]]; then
        exit 0
    fi
fi

BASENAME=$(basename "$FILE_PATH")
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLAN_LINT="$SCRIPT_DIR/../shared/plan-lint.sh"

ISSUES=0

# --- Check 1: JSON validity (everything must at least parse) ---
if ! jq empty "$FILE_PATH" 2>/dev/null; then
    echo "  ERROR: $BASENAME is not valid JSON" >&2
    [[ "$ARGV_MODE" == true ]] && exit 1
    exit 0
fi

# --- Check 2: BuildPlans get the full lint ---
if [[ "$FILE_PATH" =~ /plans/[^/]+\.json$ || "$FILE_PATH" =~ \.plan\.json$ || "$BASENAME" == plan.json ]]; then
    if [[ -x "$PLAN_LINT" ]]; then
        if OUTPUT=$("$PLAN_LINT" "$FILE_PATH" 2>&1); then
            echo "  Structure validation passed: $BASENAME (BuildPlan)" >&2
        else
            echo "  WARNING: BuildPlan lint failed for $BASENAME:" >&2
            echo "$OUTPUT" | sed 's/^/     /' >&2
            ISSUES=$((ISSUES + 1))
            [[ "$ARGV_MODE" == true ]] && exit 1
        fi
    else
        echo "  WARNING: plan-lint.sh not found — skipped BuildPlan checks" >&2
    fi
    exit 0
fi

# --- Check 3: content model sanity ---
if [[ "$BASENAME" == "content.json" ]]; then
    PAGE_COUNT=$(jq -r '.pages | length' "$FILE_PATH" 2>/dev/null || echo "")
    if [[ -z "$PAGE_COUNT" || "$PAGE_COUNT" == "null" ]]; then
        echo "  WARNING: $BASENAME has no pages[] array" >&2
        ISSUES=$((ISSUES + 1))
    else
        # Every page should have a title or name; sections should carry blocks
        UNNAMED=$(jq -r '[.pages[] | select(((.title // "") == "") and ((.name // "") == ""))] | length' "$FILE_PATH" 2>/dev/null || echo "0")
        if [[ "$UNNAMED" != "0" ]]; then
            echo "  WARNING: $UNNAMED page(s) in $BASENAME have neither title nor name" >&2
            ISSUES=$((ISSUES + 1))
        fi
        echo "  Content model: $PAGE_COUNT page(s)" >&2
    fi
fi

# --- Check 4: literal hex colors in structural artifacts ---
# Page payloads and content models should reference palette tokens, not raw hex
# (global.css / tokens.json are where raw values legitimately live).
if [[ "$BASENAME" != "tokens.json" ]]; then
    HEX_COUNT=$(grep -c '#[0-9A-Fa-f]\{6\}' "$FILE_PATH" 2>/dev/null || echo "0")
    if [[ "$HEX_COUNT" -gt 0 ]]; then
        echo "  WARNING: $BASENAME contains $HEX_COUNT literal hex color(s) — use palette token slugs" >&2
        ISSUES=$((ISSUES + 1))
    fi
fi

# --- Summary ---
if [ $ISSUES -eq 0 ]; then
    echo "  Structure validation passed: $BASENAME" >&2
else
    echo "  $ISSUES issue(s) found in $BASENAME" >&2
    [[ "$ARGV_MODE" == true ]] && exit 1
fi

exit 0
