#!/bin/bash
# PostToolUse Hook: Lint and format written/edited files
# Runs after frontend-developer agent writes or edits files
#
# Exit 0: Warnings only (non-blocking)
# Exit 2: Critical issues (blocking)

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# No file path = not a file operation
if [ -z "$FILE_PATH" ]; then
    exit 0
fi

# Get file extension
EXT="${FILE_PATH##*.}"

case "$EXT" in
    mjs)
        # Syntax check ES modules
        if command -v node >/dev/null 2>&1 && ! node --check "$FILE_PATH" 2>/dev/null; then
            echo "JS syntax error in: $FILE_PATH" >&2
            node --check "$FILE_PATH" 2>&1 | head -3 >&2
        fi
        ;;
    css)
        # Check for hardcoded colors (should use CSS custom properties)
        if grep -nE '#[0-9a-fA-F]{3,8}' "$FILE_PATH" 2>/dev/null | grep -v '^\s*//' | grep -v '^\s*\*'; then
            echo "CSS contains hardcoded color values. Use design-token custom properties (--vsp-*) instead." >&2
        fi
        ;;
    js)
        # Basic JS checks - warn about console.log in production code
        if grep -n 'console\.log' "$FILE_PATH" 2>/dev/null; then
            echo "JavaScript contains console.log statements. Remove before production." >&2
        fi
        ;;
esac

exit 0
