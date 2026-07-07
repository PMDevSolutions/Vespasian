#!/bin/bash
# Test Command Validator
# Validates test commands before execution to prevent destructive operations
# Exit 0 (allow) or Exit 2 (block)

# Read JSON input from stdin
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# List of dangerous patterns to block
DANGEROUS_PATTERNS=(
    "rm -rf"
    "DROP DATABASE"
    "DROP TABLE"
    "DELETE FROM.*WHERE 1=1"
    "TRUNCATE"
    "--force"
    "git reset --hard"
    "git clean -fd"
)

# Check for dangerous patterns
for pattern in "${DANGEROUS_PATTERNS[@]}"; do
    if echo "$COMMAND" | grep -iE "$pattern" > /dev/null; then
        echo "🚨 BLOCKED: Dangerous command pattern detected: $pattern" >&2
        echo "Command: $COMMAND" >&2
        echo "" >&2
        echo "This command could be destructive and has been blocked." >&2
        exit 2
    fi
done

# Check if it's a test command this repo actually uses:
# node --test (*.test.mjs suites), pnpm test / pnpm test:* / pnpm --filter … test,
# bats (vendored runner or npx), npm test variants, playwright.
if ! echo "$COMMAND" | grep -iE '(node +--test|pnpm( +--filter +[^ ]+)? +(run +)?test|npm test|npm run test|bats |bats$|npx +bats|playwright test)' > /dev/null; then
    # Not a test command, allow it
    exit 0
fi

# Allow the command
exit 0
