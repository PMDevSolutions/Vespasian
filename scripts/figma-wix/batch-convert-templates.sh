#!/bin/bash
# Figma-to-Wix Batch Page Converter
# Validates the multi-page conversion process and tracks progress with
# checkpoints. Used by the figma-wix-converter agent's Phase 2 orchestration:
# each Figma frame becomes a page entry in the content model, and this script
# reports how far the batch has progressed and whether the converted page
# payloads are structurally sound.
#
# (Filename kept from the Flavian ancestor for hook-wiring stability; "template"
# here now means a converted PAGE payload, not a WordPress template.)
#
# Inputs (hook JSON on stdin, or positional args):
#   $1 work dir containing converted page payloads (*.json), e.g. .vespasian/pages
#   $2 total pages expected
#   $3 pages completed so far

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
WORK_DIR=""
TOTAL_PAGES=0
COMPLETED_PAGES=0
FAILED_PAGES=0
CHECKPOINT_INTERVAL=3

# Read JSON input from stdin (if provided by tool)
INPUT=$(cat)

# Extract parameters if provided
if [ ! -z "$INPUT" ]; then
    WORK_DIR=$(echo "$INPUT" | jq -r '.tool_input.work_dir // empty' 2>/dev/null)
    TOTAL_PAGES=$(echo "$INPUT" | jq -r '.tool_input.total_pages // 0' 2>/dev/null)
    COMPLETED_PAGES=$(echo "$INPUT" | jq -r '.tool_input.completed_pages // 0' 2>/dev/null)
fi

# Allow command-line override
if [ "$1" ]; then
    WORK_DIR="$1"
fi

if [ "$2" ]; then
    TOTAL_PAGES="$2"
fi

if [ "$3" ]; then
    COMPLETED_PAGES="$3"
fi

# Validate work directory
if [ -z "$WORK_DIR" ]; then
    echo -e "${RED}ERROR: No work directory specified${NC}" >&2
    exit 0
fi

if [ ! -d "$WORK_DIR" ]; then
    echo -e "${RED}ERROR: Work directory not found: $WORK_DIR${NC}" >&2
    exit 0
fi

echo -e "${BLUE}Batch Conversion Validation${NC}" >&2
echo -e "${BLUE}Work dir: $WORK_DIR${NC}" >&2
echo "" >&2

# Count actual converted page payloads
ACTUAL_PAGES=$(find "$WORK_DIR" -maxdepth 2 -name "*.json" ! -name "tokens.json" ! -name "content.json" 2>/dev/null | wc -l | tr -d ' ')

echo -e "${BLUE}Progress Statistics:${NC}" >&2
echo "  Total pages expected: $TOTAL_PAGES" >&2
echo "  Pages completed: $COMPLETED_PAGES" >&2
echo "  Page payloads found: $ACTUAL_PAGES" >&2
echo "" >&2

# Check if checkpoint is needed
if [ $COMPLETED_PAGES -gt 0 ]; then
    CHECKPOINT_DUE=$((COMPLETED_PAGES % CHECKPOINT_INTERVAL))
    if [ $CHECKPOINT_DUE -eq 0 ]; then
        echo -e "${YELLOW}Checkpoint recommended (every $CHECKPOINT_INTERVAL pages)${NC}" >&2
        echo "  Save state to episodic memory / .vespasian/checkpoints" >&2
        echo "" >&2
    fi
fi

# Calculate progress percentage
if [ $TOTAL_PAGES -gt 0 ]; then
    PROGRESS=$((COMPLETED_PAGES * 100 / TOTAL_PAGES))
    echo -e "${GREEN}Progress: $PROGRESS% ($COMPLETED_PAGES / $TOTAL_PAGES)${NC}" >&2

    # Visual progress bar
    BAR_LENGTH=20
    FILLED=$((PROGRESS * BAR_LENGTH / 100))
    EMPTY=$((BAR_LENGTH - FILLED))

    printf "  [" >&2
    printf "%${FILLED}s" | tr ' ' '=' >&2
    printf "%${EMPTY}s" | tr ' ' ' ' >&2
    printf "]\n" >&2
    echo "" >&2
fi

# Validate each converted page payload
echo -e "${BLUE}Validating Page Payloads:${NC}" >&2

while IFS= read -r payload; do
    [ -f "$payload" ] || continue
    PAGE_NAME=$(basename "$payload")

    # JSON must parse
    if ! jq empty "$payload" 2>/dev/null; then
        echo -e "  ${YELLOW}WARN $PAGE_NAME: invalid JSON${NC}" >&2
        FAILED_PAGES=$((FAILED_PAGES + 1))
        continue
    fi

    # Hardcoded hex colors in page payloads should be token references instead
    HARDCODED_COLORS=$(grep -c '#[0-9A-Fa-f]\{6\}' "$payload" 2>/dev/null || echo "0")

    # Count sections/blocks for a quick sanity signal
    BLOCK_COUNT=$(jq -r '[.. | objects | select(has("type"))] | length' "$payload" 2>/dev/null || echo "0")

    if [ "$HARDCODED_COLORS" -gt 0 ]; then
        echo -e "  ${YELLOW}WARN $PAGE_NAME: $HARDCODED_COLORS hardcoded color(s) found — use palette tokens${NC}" >&2
        FAILED_PAGES=$((FAILED_PAGES + 1))
    else
        echo -e "  ${GREEN}OK $PAGE_NAME: valid ($BLOCK_COUNT typed blocks)${NC}" >&2
    fi
done < <(find "$WORK_DIR" -maxdepth 2 -name "*.json" ! -name "tokens.json" ! -name "content.json" 2>/dev/null)

echo "" >&2

# Check for tokens.json alongside the batch
TOKENS_FILE=""
if [ -f "$WORK_DIR/tokens.json" ]; then
    TOKENS_FILE="$WORK_DIR/tokens.json"
elif [ -f ".vespasian/tokens.json" ]; then
    TOKENS_FILE=".vespasian/tokens.json"
fi

if [ -n "$TOKENS_FILE" ]; then
    echo -e "${GREEN}tokens.json found ($TOKENS_FILE)${NC}" >&2

    if command -v jq &> /dev/null; then
        COLORS=$(jq -r '(.palette // .settings.color.palette // []) | length' "$TOKENS_FILE" 2>/dev/null || echo "?")
        FONT_SIZES=$(jq -r '(.fontSizes // .settings.typography.fontSizes // []) | length' "$TOKENS_FILE" 2>/dev/null || echo "?")
        SPACING=$(jq -r '(.spacingSizes // .settings.spacing.spacingSizes // []) | length' "$TOKENS_FILE" 2>/dev/null || echo "?")

        echo "  Colors: $COLORS" >&2
        echo "  Font Sizes: $FONT_SIZES" >&2
        echo "  Spacing Tokens: $SPACING" >&2
    fi
else
    echo -e "${RED}ERROR: tokens.json not found${NC}" >&2
fi

echo "" >&2

# Summary
echo -e "${BLUE}Batch Conversion Summary:${NC}" >&2
if [ $FAILED_PAGES -eq 0 ]; then
    echo -e "${GREEN}All page payloads valid${NC}" >&2
else
    echo -e "${YELLOW}$FAILED_PAGES page payload(s) have issues${NC}" >&2
fi

# Check if conversion complete
PAGES_REMAINING=$((TOTAL_PAGES - COMPLETED_PAGES))
if [ $PAGES_REMAINING -gt 0 ]; then
    echo -e "${BLUE}$PAGES_REMAINING pages remaining${NC}" >&2
    echo "" >&2
    echo -e "${BLUE}Continue with next page (autonomous)${NC}" >&2
else
    echo -e "${GREEN}All pages complete!${NC}" >&2
    echo "" >&2
    echo -e "${BLUE}Next: compile the BuildPlan (vespasian plan) and run the completion hook${NC}" >&2
fi

exit 0
