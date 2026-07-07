#!/bin/bash
# Design Token Auditor - PostToolUse hook
# Detects hardcoded values in generated Wix output that should use design
# tokens instead. Central to Vespasian's 100%-token-usage guarantee.
# Exit 0 (warn) - displays issues but doesn't block.
#
# Audited files: CSS / HTML / JSON artifacts under .vespasian/ (staged site
# repo, page payloads). The two files where raw values legitimately live are
# excluded: tokens.json (the source of truth) and src/styles/global.css
# (where the translator DEFINES the --vsp-* custom properties).

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# Only audit generated artifacts in the Vespasian state dir
if [[ ! "$FILE_PATH" =~ (^|/)\.vespasian/.*\.(css|html|json)$ ]]; then
    exit 0
fi

# Token definition files are allowed to contain raw values
if [[ "$FILE_PATH" =~ tokens\.json$ || "$FILE_PATH" =~ src/styles/global\.css$ ]]; then
    exit 0
fi

if [[ ! -f "$FILE_PATH" ]]; then
    exit 0
fi

ISSUES=0
BASENAME=$(basename "$FILE_PATH")

# --- Check 1: Hardcoded hex colors ---
HEX_COUNT=$(grep -c '#[0-9A-Fa-f]\{3,8\}\b' "$FILE_PATH" 2>/dev/null || echo "0")
if [ "$HEX_COUNT" -gt 0 ]; then
    echo "  WARNING $BASENAME: $HEX_COUNT hardcoded hex color(s) — reference palette tokens / theme slots instead" >&2
    grep -n '#[0-9A-Fa-f]\{3,8\}' "$FILE_PATH" 2>/dev/null | head -3 | while read -r line; do
        echo "     $line" >&2
    done
    ISSUES=$((ISSUES + HEX_COUNT))
fi

# --- Check 2: Hardcoded pixel spacing not routed through --vsp-space-* ---
HARDCODED_SPACING=$(grep -oE '(padding|margin|gap)[^;}"]*[0-9]+px' "$FILE_PATH" 2>/dev/null | grep -cv 'var(--vsp-' || echo "0")
if [ "$HARDCODED_SPACING" -gt 0 ]; then
    echo "  WARNING $BASENAME: $HARDCODED_SPACING hardcoded px spacing value(s) — should use var(--vsp-space-XX)" >&2
    ISSUES=$((ISSUES + HARDCODED_SPACING))
fi

# --- Check 3: Hardcoded font-size not routed through a token / text-theme slot ---
HARDCODED_FONT=$(grep -oE '(font-size:[[:space:]]*[0-9]+px|"fontSize"[[:space:]]*:[[:space:]]*"?[0-9]+px)' "$FILE_PATH" 2>/dev/null | grep -cv 'var(--vsp-' || echo "0")
if [ "$HARDCODED_FONT" -gt 0 ]; then
    echo "  WARNING $BASENAME: $HARDCODED_FONT hardcoded font-size(s) — should map to a text-theme slot (H1-H6/P1-P3) or a .vsp-* class" >&2
    ISSUES=$((ISSUES + HARDCODED_FONT))
fi

# --- Check 4: Hardcoded font-family ---
HARDCODED_FAMILY=$(grep -oE '(font-family:|"fontFamily")' "$FILE_PATH" 2>/dev/null | wc -l | tr -d ' ')
if [ "$HARDCODED_FAMILY" -gt 0 ]; then
    echo "  NOTE $BASENAME: $HARDCODED_FAMILY font-family declaration(s) — verify they reference fontFamilies tokens" >&2
fi

# --- Summary ---
if [ $ISSUES -eq 0 ]; then
    echo "  Token audit passed: $BASENAME (zero hardcoded values)" >&2
else
    echo "  Token audit: $ISSUES hardcoded value(s) in $BASENAME" >&2
fi

exit 0
