#!/bin/bash
# Figma/Canva-to-Wix Conversion Completion Hook
# Runs when a design-to-Wix conversion finishes compiling its BuildPlan.
# Summarizes the plan, audits token discipline, runs available validators,
# and writes a markdown completion report to .claude/reports/.
#
# Usage:
#   bash .claude/hooks/figma-wix-completion.sh [path/to/plan.json]
#   (or pipe hook JSON with .tool_input.plan_path)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# A command-line argument wins; only read stdin JSON when no argument was
# given AND stdin is not a terminal (avoids blocking on manual invocation).
PLAN_PATH=""
if [ -n "$1" ]; then
    PLAN_PATH="$1"
elif [ ! -t 0 ]; then
    INPUT=$(cat)
    PLAN_PATH=$(echo "$INPUT" | jq -r '.tool_input.plan_path // .plan_path // empty' 2>/dev/null)
fi

# If a directory was given, look for plan.json inside it
if [ -d "$PLAN_PATH" ]; then
    PLAN_PATH="$PLAN_PATH/plan.json"
fi

# If no plan specified, use the most recently modified plan JSON
# (ls -t is portable; GNU-only `find -printf` is deliberately avoided)
if [ -z "$PLAN_PATH" ] && [ -d ".vespasian/plans" ]; then
    PLAN_PATH=$(find .vespasian/plans -type f -name '*.json' -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1)
fi

if [ -z "$PLAN_PATH" ] || [ ! -f "$PLAN_PATH" ]; then
    echo -e "${RED}No BuildPlan found (looked in .vespasian/plans/)${NC}" >&2
    echo "   Compile one first: vespasian plan <ir-dir> " >&2
    exit 0
fi

PLAN_NAME=$(basename "$PLAN_PATH" .json)
PLAN_DIR=$(dirname "$PLAN_PATH")

echo "" >&2
echo -e "${PURPLE}=============================================${NC}" >&2
echo -e "${PURPLE}  Design-to-Wix conversion: plan compiled    ${NC}" >&2
echo -e "${PURPLE}=============================================${NC}" >&2
echo "" >&2
echo -e "${BLUE}Plan: $PLAN_NAME${NC}" >&2
echo -e "${BLUE}Location: $PLAN_PATH${NC}" >&2
echo "" >&2

TOTAL_ERRORS=0
TOTAL_WARNINGS=0

HAVE_JQ=0
command -v jq &> /dev/null && HAVE_JQ=1

# Step 1: Plan summary (steps by phase and channel)
STEPS=0; FIDELITY=0; API_STEPS=0; CLI_STEPS=0; PW_STEPS=0; AGENT_STEPS=0; SITE_TITLE="?"
if [ "$HAVE_JQ" -eq 1 ] && jq empty "$PLAN_PATH" 2>/dev/null; then
    STEPS=$(jq '.steps | length' "$PLAN_PATH" 2>/dev/null || echo 0)
    FIDELITY=$(jq '.fidelity | length' "$PLAN_PATH" 2>/dev/null || echo 0)
    API_STEPS=$(jq '[.steps[] | select(.method == "api")] | length' "$PLAN_PATH" 2>/dev/null || echo 0)
    CLI_STEPS=$(jq '[.steps[] | select(.method == "cli")] | length' "$PLAN_PATH" 2>/dev/null || echo 0)
    PW_STEPS=$(jq '[.steps[] | select(.method == "playwright")] | length' "$PLAN_PATH" 2>/dev/null || echo 0)
    AGENT_STEPS=$(jq '[.steps[] | select(.method == "agent")] | length' "$PLAN_PATH" 2>/dev/null || echo 0)
    SITE_TITLE=$(jq -r '.site.title // "?"' "$PLAN_PATH" 2>/dev/null)

    echo -e "${BLUE}Plan summary:${NC}" >&2
    echo "  Site title: $SITE_TITLE" >&2
    echo "  Steps: $STEPS  (api: $API_STEPS · cli: $CLI_STEPS · playwright: $PW_STEPS · agent: $AGENT_STEPS)" >&2
    echo "  Fidelity notes: $FIDELITY" >&2

    if [ "$STEPS" -eq 0 ]; then
        echo -e "  ${RED}Plan has zero steps — compilation likely failed${NC}" >&2
        TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
    fi
else
    echo -e "${RED}Plan is not valid JSON (or jq missing) — cannot summarize${NC}" >&2
    TOTAL_ERRORS=$((TOTAL_ERRORS + 1))
fi
echo "" >&2

# Step 2: Token discipline audit over the translate output (global.css)
echo -e "${BLUE}Design-token audit:${NC}" >&2
STRAY_CSS_HEX=0
CSS_FILES=$(find "$PLAN_DIR" .vespasian/staging -type f -name 'global.css' 2>/dev/null | sort -u)
if [ -n "$CSS_FILES" ]; then
    while IFS= read -r css; do
        # Hex literals are expected inside --vsp-* custom property definitions;
        # anywhere else they bypass the token system.
        HITS=$(grep -nE '#[0-9a-fA-F]{3,8}\b' "$css" 2>/dev/null | grep -cv -- '--vsp-')
        if [ "${HITS:-0}" -gt 0 ]; then
            echo -e "  ${YELLOW}$css: $HITS hex literal(s) outside --vsp-* definitions${NC}" >&2
            STRAY_CSS_HEX=$((STRAY_CSS_HEX + HITS))
        fi
    done <<< "$CSS_FILES"
    if [ "$STRAY_CSS_HEX" -eq 0 ]; then
        echo -e "  ${GREEN}global.css uses --vsp-* tokens (no stray hex)${NC}" >&2
    else
        TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
    fi
else
    echo "  (no global.css found next to the plan — theme translation may not have run)" >&2
fi
echo "" >&2

# Step 3: Run available validators
echo -e "${BLUE}Quality checks:${NC}" >&2
if [ -x "./scripts/validate-site.sh" ]; then
    echo -n "  validate-site... " >&2
    if ./scripts/validate-site.sh "$PLAN_PATH" > /dev/null 2>&1; then
        echo -e "${GREEN}passed${NC}" >&2
    else
        echo -e "${YELLOW}issues found${NC}" >&2
        TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
    fi
else
    echo "  validate-site.sh not found (skipped)" >&2
fi
if [ -x "./scripts/wix-structure-validator/validate-structure.sh" ]; then
    echo -n "  structure validator... " >&2
    if ./scripts/wix-structure-validator/validate-structure.sh "$PLAN_PATH" > /dev/null 2>&1; then
        echo -e "${GREEN}passed${NC}" >&2
    else
        echo -e "${YELLOW}issues found${NC}" >&2
        TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1))
    fi
else
    echo "  wix-structure-validator not found (skipped)" >&2
fi
echo "" >&2

# Step 4: Generate completion report
REPORT_DIR=".claude/reports"
REPORT_FILE="$REPORT_DIR/figma-wix-completion-$(date +%Y%m%d-%H%M%S).md"
mkdir -p "$REPORT_DIR"

echo -e "${BLUE}Writing completion report:${NC}" >&2
echo "  $REPORT_FILE" >&2

cat > "$REPORT_FILE" <<EOF
# Design-to-Wix Conversion Completion Report

**Generated:** $(date '+%Y-%m-%d %H:%M:%S')
**Plan:** $PLAN_NAME
**Location:** $PLAN_PATH
**Site title:** $SITE_TITLE

---

## BuildPlan

- **Steps:** $STEPS
  - API (REST): $API_STEPS
  - CLI (global.css / Velo): $CLI_STEPS
  - Playwright (deterministic editor flows): $PW_STEPS
  - Agent (visual canvas composition): $AGENT_STEPS
- **Fidelity notes:** $FIDELITY (see the FidelityReport after apply/qa for the full loss record)

## Token discipline

- Stray hex literals in global.css (outside \`--vsp-*\` definitions): $STRAY_CSS_HEX
- $([ "$STRAY_CSS_HEX" -eq 0 ] && echo "All styling flows through the token system." || echo "Review the flagged lines — colors belong in the ThemePlan palette or --vsp-* variables.")

## Next steps

1. Rehearse without touching Wix:
   \`\`\`bash
   vespasian apply $PLAN_PATH --dry-run
   \`\`\`
2. Apply for real (needs WIX_API_KEY / WIX_ACCOUNT_ID; editor steps need a consented session from \`vespasian login --editor\`):
   \`\`\`bash
   vespasian apply $PLAN_PATH
   \`\`\`
3. Publish and verify against the source design:
   \`\`\`bash
   vespasian publish
   vespasian qa
   \`\`\`

## Summary

$(if [ $TOTAL_ERRORS -eq 0 ] && [ $TOTAL_WARNINGS -eq 0 ]; then
    echo "**Plan compiled cleanly.** No errors or warnings."
elif [ $TOTAL_ERRORS -eq 0 ]; then
    echo "**Plan compiled** with $TOTAL_WARNINGS warning(s) — review recommended."
else
    echo "**Plan has issues:** $TOTAL_ERRORS error(s), $TOTAL_WARNINGS warning(s)."
fi)

---

*Generated by the figma-wix-completion hook*
EOF

echo "" >&2

# Step 5: Final summary
if [ $TOTAL_ERRORS -eq 0 ] && [ $TOTAL_WARNINGS -eq 0 ]; then
    echo -e "${GREEN}Plan compiled cleanly. No errors or warnings.${NC}" >&2
elif [ $TOTAL_ERRORS -eq 0 ]; then
    echo -e "${GREEN}Plan compiled.${NC} ${YELLOW}$TOTAL_WARNINGS warning(s) — review recommended.${NC}" >&2
else
    echo -e "${YELLOW}Plan has issues: $TOTAL_ERRORS error(s), $TOTAL_WARNINGS warning(s)${NC}" >&2
fi

echo "" >&2
echo -e "${BLUE}Full report: $REPORT_FILE${NC}" >&2
echo -e "${BLUE}Next: vespasian apply $PLAN_PATH --dry-run${NC}" >&2
echo "" >&2

exit 0
