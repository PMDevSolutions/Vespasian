#!/bin/bash
# Canva-to-Wix Comparison Report Generator
# Creates a report comparing the source Canva export to the generated Wix
# build artifacts (tokens.json + BuildPlan + staged global.css).
# Runs on agent completion. Always exits 0.

echo "Generating Canva-to-Wix comparison report..." >&2

# Create reports directory
mkdir -p .claude/reports

REPORT_FILE=".claude/reports/canva-wix-comparison.md"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

cat > "$REPORT_FILE" << EOF
# Canva-to-Wix Conversion Report

**Generated:** $TIMESTAMP

## Summary

This report documents the conversion of a Canva HTML/CSS export into Wix build
artifacts (design tokens, BuildPlan, staged custom CSS).

## Design Token Extraction

EOF

# --- Tokens ---
TOKENS_FILE=""
for candidate in .vespasian/tokens.json tokens.json; do
    [ -f "$candidate" ] && TOKENS_FILE="$candidate" && break
done
if [ -z "$TOKENS_FILE" ]; then
    TOKENS_FILE=$(find .vespasian -maxdepth 3 -name "tokens.json" 2>/dev/null | head -1)
fi

if [ -n "$TOKENS_FILE" ] && [ -f "$TOKENS_FILE" ]; then
    echo "**File:** \`$TOKENS_FILE\`" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"

    COLOR_COUNT=$(jq -r '(.palette // .settings.color.palette // []) | length' "$TOKENS_FILE" 2>/dev/null)
    FONT_SIZE_COUNT=$(jq -r '(.fontSizes // .settings.typography.fontSizes // []) | length' "$TOKENS_FILE" 2>/dev/null)
    SPACING_COUNT=$(jq -r '(.spacingSizes // .settings.spacing.spacingSizes // []) | length' "$TOKENS_FILE" 2>/dev/null)

    echo "- Colors: $COLOR_COUNT" >> "$REPORT_FILE"
    echo "- Font Sizes: $FONT_SIZE_COUNT" >> "$REPORT_FILE"
    echo "- Spacing Tokens: $SPACING_COUNT" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
else
    echo "**Status:** WARNING — no tokens.json found" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
fi

# --- BuildPlan ---
echo "## BuildPlan" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

PLAN_FILE=$(ls -t .vespasian/plans/*.json 2>/dev/null | head -1)

if [ -n "$PLAN_FILE" ] && [ -f "$PLAN_FILE" ]; then
    echo "**File:** \`$PLAN_FILE\`" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"

    STEP_COUNT=$(jq -r '.steps | length' "$PLAN_FILE" 2>/dev/null || echo "?")
    echo "**Total steps:** $STEP_COUNT" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"

    echo "### Steps by phase" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    jq -r '.steps | group_by(.phase) | .[] | "- **\(.[0].phase)**: \(length) step(s) (\([.[].method] | unique | join(", ")))"' \
        "$PLAN_FILE" 2>/dev/null >> "$REPORT_FILE" || echo "_Could not summarize steps._" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"

    # Lint verdict
    if [ -x "scripts/shared/plan-lint.sh" ]; then
        if scripts/shared/plan-lint.sh "$PLAN_FILE" >/dev/null 2>&1; then
            echo "**Lint:** plan-lint passed" >> "$REPORT_FILE"
        else
            echo "**Lint:** WARNING — plan-lint reported errors (run \`scripts/shared/plan-lint.sh $PLAN_FILE\`)" >> "$REPORT_FILE"
        fi
        echo "" >> "$REPORT_FILE"
    fi

    # Fidelity notes recorded at translate/compile time
    FIDELITY_COUNT=$(jq -r '.fidelity | length' "$PLAN_FILE" 2>/dev/null || echo "0")
    echo "### Fidelity notes ($FIDELITY_COUNT)" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    if [ "$FIDELITY_COUNT" != "0" ] && [ -n "$FIDELITY_COUNT" ]; then
        jq -r '.fidelity[] | "- [\(.severity)] \(.code): \(.message)"' "$PLAN_FILE" 2>/dev/null >> "$REPORT_FILE" || true
    else
        echo "_No translation losses recorded — but check the FidelityReport after apply._" >> "$REPORT_FILE"
    fi
    echo "" >> "$REPORT_FILE"
else
    echo "**Status:** WARNING — no BuildPlan found under .vespasian/plans/" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "Compile one with \`vespasian plan <ir>\`." >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
fi

# --- Quality checks: hardcoded values in staged output ---
echo "## Quality Checks" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

STAGE_DIR=".vespasian/dryrun/site-repo"
HARDCODED_TOTAL=0

if [ -d "$STAGE_DIR" ] && [ -x "scripts/figma-wix/optimize-tokens.sh" ]; then
    OPTIMIZE_OUTPUT=$(scripts/figma-wix/optimize-tokens.sh "$STAGE_DIR" 2>&1 || echo "Optimization analysis failed")
    HARDCODED_LINE=$(echo "$OPTIMIZE_OUTPUT" | grep "Total hardcoded values found:" | head -1)
    SUMMARY_LINE=$(echo "$OPTIMIZE_OUTPUT" | grep -E "EXCELLENT|GOOD|NEEDS WORK" | head -1)

    [ -n "$HARDCODED_LINE" ] && echo "$HARDCODED_LINE" >> "$REPORT_FILE" && echo "" >> "$REPORT_FILE"
    [ -n "$SUMMARY_LINE" ] && echo "$SUMMARY_LINE" >> "$REPORT_FILE" && echo "" >> "$REPORT_FILE"
    echo "*Run \`./scripts/figma-wix/optimize-tokens.sh $STAGE_DIR\` for detailed token recommendations.*" >> "$REPORT_FILE"
else
    echo "_No staged output found ($STAGE_DIR). Run a dry-run apply to populate it._" >> "$REPORT_FILE"
fi

echo "" >> "$REPORT_FILE"

# --- Next steps ---
echo "## Next Steps" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "1. **Review the BuildPlan** (\`vespasian apply <plan> --dry-run\`)" >> "$REPORT_FILE"
echo "2. **Apply to the target site** (\`vespasian apply <plan>\`) — editor steps escalate to the wix-site-builder agent" >> "$REPORT_FILE"
echo "3. **Publish** (\`vespasian publish\`)" >> "$REPORT_FILE"
echo "4. **Run QA** (\`vespasian qa\`) — screenshots at the three Studio breakpoints + FidelityReport" >> "$REPORT_FILE"
echo "5. **Verify the live site** (\`scripts/shared/verify-published.sh\`)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "---" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "*Report generated by the canva-wix-converter agent*" >> "$REPORT_FILE"

echo "" >&2
echo "Comparison report generated: $REPORT_FILE" >&2

# Always exit 0
exit 0
