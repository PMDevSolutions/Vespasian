#!/bin/bash
# Stop Hook: Generate build status report
# Runs when the frontend-developer agent completes
#
# Creates a summary report in .claude/reports/frontend-developer/

REPORT_DIR=".claude/reports/frontend-developer"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="$REPORT_DIR/build_${TIMESTAMP}.md"

mkdir -p "$REPORT_DIR"

{
    echo "# Frontend Developer Build Report"
    echo ""
    echo "**Generated:** $(date)"
    echo ""

    # Count modified files by type
    echo "## Files Modified"
    echo ""

    PHP_COUNT=$(git diff --name-only HEAD 2>/dev/null | grep -c '\.php$' || echo 0)
    CSS_COUNT=$(git diff --name-only HEAD 2>/dev/null | grep -c '\.css$' || echo 0)
    JS_COUNT=$(git diff --name-only HEAD 2>/dev/null | grep -c '\.js$' || echo 0)
    HTML_COUNT=$(git diff --name-only HEAD 2>/dev/null | grep -c '\.html$' || echo 0)

    echo "| Type | Count |"
    echo "|------|-------|"
    echo "| PHP | $PHP_COUNT |"
    echo "| CSS | $CSS_COUNT |"
    echo "| JS | $JS_COUNT |"
    echo "| HTML | $HTML_COUNT |"
    echo ""

    # List theme files changed
    echo "## Theme Files Changed"
    echo ""
    git diff --name-only HEAD 2>/dev/null | grep -E '^themes/' || echo "None"
    echo ""

    # Run quick validation
    echo "## Validation Status"
    echo ""

    # Syntax-check changed JS/module files
    CHANGED_JS=$(git diff --name-only HEAD 2>/dev/null | grep -E '\.(mjs|js)$' | grep -v node_modules || true)
    if [ -n "$CHANGED_JS" ] && command -v node >/dev/null 2>&1; then
        SYNTAX_ISSUES=0
        for f in $CHANGED_JS; do
            if [ -f "$f" ] && ! node --check "$f" >/dev/null 2>&1; then
                SYNTAX_ISSUES=$((SYNTAX_ISSUES + 1))
            fi
        done
        if [ $SYNTAX_ISSUES -gt 0 ]; then
            echo "- Syntax: $SYNTAX_ISSUES JS file(s) with errors"
        else
            echo "- Syntax: Passed"
        fi
    else
        echo "- Syntax: No JS files changed"
    fi

} > "$REPORT_FILE"

echo "Build report saved to: $REPORT_FILE" >&2
exit 0
