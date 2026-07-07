#!/bin/bash
# Figma/Canva-to-Wix Post-Page Hook (warn-only)
#
# Run after each BuildPlan or page-fragment artifact is written under
# .vespasian/plans/. Validates JSON syntax, audits for literal design values
# that should be token references, and delegates to the structure validator
# when available.
#
# NOT auto-registered in .claude/settings.json — the conversion workflow
# skills invoke it manually after each generated artifact:
#   echo '{"tool_input":{"file_path":".vespasian/plans/my-site/plan.json"}}' \
#     | bash .claude/hooks/figma-wix-post-page.sh
#
# Always exits 0 (warns, never blocks) so it cannot interrupt an autonomous run.

# A direct path argument wins; only read stdin JSON when no argument was
# given AND stdin is not a terminal (avoids blocking on manual invocation).
FILE_PATH=""
if [ -n "$1" ]; then
    FILE_PATH="$1"
elif [ ! -t 0 ]; then
    INPUT=$(cat)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
fi

# Only process JSON artifacts under .vespasian/plans/
if [[ ! "$FILE_PATH" =~ \.vespasian/plans/.*\.json$ ]]; then
    exit 0
fi

if [[ ! -f "$FILE_PATH" ]]; then
    exit 0
fi

echo "" >&2
echo "Post-page validation: $(basename "$FILE_PATH")" >&2
echo "---------------------------------------------" >&2

# 1. JSON syntax
if command -v jq &> /dev/null; then
    if jq empty "$FILE_PATH" 2>/dev/null; then
        echo "  [ok] Valid JSON" >&2
    else
        echo "  [warn] INVALID JSON — fix before compiling/applying" >&2
    fi
else
    echo "  [skip] jq not installed, JSON syntax not checked" >&2
fi

# 2. Literal hex colors in step inputs (theme values belong in the ThemePlan /
#    token map, not inline in page composition steps). The plan's own
#    palette/theme sections legitimately contain hex, so only flag hex that
#    appears outside "palette"/"colors"/"theme" contexts.
if command -v jq &> /dev/null && jq empty "$FILE_PATH" 2>/dev/null; then
    HEX_HITS=$(jq -r '[.. | strings | select(test("#[0-9a-fA-F]{6}"))] | length' "$FILE_PATH" 2>/dev/null || echo "0")
    THEME_HEX=$(jq -r '[(.theme // .palette // .tokens // empty) | .. | strings | select(test("#[0-9a-fA-F]{6}"))] | length' "$FILE_PATH" 2>/dev/null || echo "0")
    STRAY_HEX=$((HEX_HITS - THEME_HEX))
    if [ "$STRAY_HEX" -gt 0 ]; then
        echo "  [warn] $STRAY_HEX hex literal(s) outside the theme/palette section — reference token slugs or --vsp-* variables instead" >&2
    else
        echo "  [ok] No stray hex literals" >&2
    fi
fi

# 3. Delegate to the BuildPlan structure validator when present
if [ -x "./scripts/wix-structure-validator/validate-structure.sh" ]; then
    ./scripts/wix-structure-validator/validate-structure.sh "$FILE_PATH" >&2 || true
fi

echo "---------------------------------------------" >&2
echo "" >&2

# Always exit 0 (warn, don't block)
exit 0
