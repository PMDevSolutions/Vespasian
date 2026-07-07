#!/bin/bash
# Design Token Optimizer
# Analyzes generated Wix output artifacts for repeated hardcoded values and
# suggests promoting them to design tokens (tokens.json).
#
# Scans an output directory (typically the dry-run site repo staged by the CLI
# channel, e.g. .vespasian/dryrun/site-repo, or a directory of page payload
# JSON) for literal colors, font sizes, and spacing values that appear often
# enough to deserve a token. The token definitions themselves live in
# global.css (--vsp-* custom properties) and are excluded from the scan.
#
# Usage: optimize-tokens.sh <output-dir> [tokens.json]
#   output-dir   directory of generated artifacts (.css/.html/.json scanned)
#   tokens.json  token file to report coverage against
#                (default: <output-dir>/tokens.json, then .vespasian/tokens.json)

set -e

OUTPUT_DIR="${1:-.vespasian/dryrun/site-repo}"
TOKENS_FILE="${2:-}"

echo "Analyzing generated output for token optimization: $OUTPUT_DIR"
echo ""

if [[ ! -d "$OUTPUT_DIR" ]]; then
    echo "ERROR: No output directory found at $OUTPUT_DIR"
    echo "Run a dry-run apply first (vespasian apply <plan> --dry-run) or pass a directory."
    exit 1
fi

if [[ -z "$TOKENS_FILE" ]]; then
    if [[ -f "$OUTPUT_DIR/tokens.json" ]]; then
        TOKENS_FILE="$OUTPUT_DIR/tokens.json"
    else
        TOKENS_FILE=".vespasian/tokens.json"
    fi
fi

# Create temp files for analysis
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT
COLORS_FILE="$TEMP_DIR/colors.txt"
SPACING_FILE="$TEMP_DIR/spacing.txt"
FONT_SIZES_FILE="$TEMP_DIR/font-sizes.txt"
touch "$COLORS_FILE" "$SPACING_FILE" "$FONT_SIZES_FILE"

# Collect scannable files — skip global.css (that's where the tokens are DEFINED).
find "$OUTPUT_DIR" -type f \( -name "*.css" -o -name "*.html" -o -name "*.json" \) \
    ! -name "tokens.json" ! -path "*/styles/global.css" | while read -r artifact; do
    # Spacing values (padding, margin, gap) — literal px not routed through var(--vsp-…)
    grep -oE '(padding|margin|gap)[^;}"]*[0-9]+px' "$artifact" 2>/dev/null \
        | grep -v 'var(--vsp-' | grep -oE '[0-9]+px' >> "$SPACING_FILE" || true

    # Font sizes — CSS `font-size: Npx` and JSON `"fontSize": "Npx"`
    grep -oE '(font-size:[[:space:]]*[0-9]+px|"fontSize"[[:space:]]*:[[:space:]]*"[0-9]+px")' "$artifact" 2>/dev/null \
        | grep -oE '[0-9]+px' >> "$FONT_SIZES_FILE" || true

    # Hex colors
    grep -oE '#[0-9A-Fa-f]{6}' "$artifact" 2>/dev/null >> "$COLORS_FILE" || true
done

# Map a px value to a --vsp-space-* slug suggestion
space_slug() {
    local px="$1"
    if   [[ $px -le 8 ]];  then echo "20"
    elif [[ $px -le 16 ]]; then echo "30"
    elif [[ $px -le 24 ]]; then echo "40"
    elif [[ $px -le 32 ]]; then echo "50"
    elif [[ $px -le 48 ]]; then echo "60"
    elif [[ $px -le 64 ]]; then echo "70"
    else echo "80"
    fi
}

# --- Spacing analysis ---
echo "## Spacing Analysis"
echo ""

if [[ -s "$SPACING_FILE" ]]; then
    SPACING_USAGE=$(sort "$SPACING_FILE" | uniq -c | sort -rn)
    echo "Most commonly used spacing values:"
    echo ""
    echo "$SPACING_USAGE" | head -10 | while read -r count value; do
        if [[ $count -ge 3 ]]; then
            echo "  $value used $count times -> SHOULD BE A SPACING TOKEN"
        else
            echo "  $value used $count times"
        fi
    done
    echo ""
    echo "Recommendations:"
    echo ""
    echo "$SPACING_USAGE" | head -10 | while read -r count value; do
        if [[ $count -ge 3 ]]; then
            SIZE=${value%px}
            SLUG=$(space_slug "$SIZE")
            echo "  Add to tokens.json spacingSizes: { \"slug\": \"$SLUG\", \"size\": \"$value\", \"name\": \"Space $SLUG\" }"
            echo "    -> translates to --vsp-space-$SLUG in global.css"
        fi
    done
else
    echo "  No hardcoded spacing values found"
fi

echo ""
echo "---"
echo ""

# --- Font size analysis ---
echo "## Font Size Analysis"
echo ""

if [[ -s "$FONT_SIZES_FILE" ]]; then
    FONT_SIZE_USAGE=$(sort "$FONT_SIZES_FILE" | uniq -c | sort -rn)
    echo "Most commonly used font sizes:"
    echo ""
    echo "$FONT_SIZE_USAGE" | head -10 | while read -r count value; do
        if [[ $count -ge 2 ]]; then
            echo "  $value used $count times -> SHOULD BE A TYPE-RAMP TOKEN"
        else
            echo "  $value used $count times"
        fi
    done
    echo ""
    echo "Recommendations:"
    echo ""
    echo "$FONT_SIZE_USAGE" | head -10 | while read -r count value; do
        if [[ $count -ge 2 ]]; then
            echo "  Add to tokens.json fontSizes: { \"slug\": \"size-${value%px}\", \"size\": \"$value\" }"
            echo "    -> maps onto a Wix text-theme slot (H1-H6/P1-P3) or a .vsp-* overflow class"
        fi
    done
else
    echo "  No hardcoded font sizes found"
fi

echo ""
echo "---"
echo ""

# --- Color analysis ---
echo "## Color Analysis"
echo ""

if [[ -s "$COLORS_FILE" ]]; then
    COLOR_USAGE=$(sort -f "$COLORS_FILE" | uniq -ci | sort -rn)
    echo "Most commonly used colors:"
    echo ""
    echo "$COLOR_USAGE" | head -10 | while read -r count value; do
        if [[ $count -ge 2 ]]; then
            echo "  $value used $count times -> SHOULD BE A PALETTE TOKEN"
        else
            echo "  $value used $count times"
        fi
    done
    echo ""
    echo "Recommendations:"
    echo ""
    INDEX=1
    echo "$COLOR_USAGE" | head -10 | while read -r count value; do
        if [[ $count -ge 2 ]]; then
            echo "  Add to tokens.json palette: { \"slug\": \"color-$INDEX\", \"color\": \"$value\", \"name\": \"Color $INDEX\" }"
            INDEX=$((INDEX + 1))
        fi
    done
else
    echo "  No hardcoded colors found"
fi

echo ""
echo "---"
echo ""

# --- Token coverage ---
if [[ -f "$TOKENS_FILE" ]]; then
    echo "## Current Token Coverage ($TOKENS_FILE)"
    echo ""

    COLOR_COUNT=$(jq -r '(.palette // .settings.color.palette // []) | length' "$TOKENS_FILE" 2>/dev/null || echo "0")
    FONT_SIZE_COUNT=$(jq -r '(.fontSizes // .settings.typography.fontSizes // []) | length' "$TOKENS_FILE" 2>/dev/null || echo "0")
    SPACING_COUNT=$(jq -r '(.spacingSizes // .settings.spacing.spacingSizes // []) | length' "$TOKENS_FILE" 2>/dev/null || echo "0")

    echo "  Colors: $COLOR_COUNT tokens"
    echo "  Font Sizes: $FONT_SIZE_COUNT tokens"
    echo "  Spacing: $SPACING_COUNT tokens"
    echo ""

    if [[ $COLOR_COUNT -ge 6 ]] && [[ $FONT_SIZE_COUNT -ge 5 ]] && [[ $SPACING_COUNT -ge 6 ]]; then
        echo "  Good token coverage - design system is comprehensive"
    else
        echo "  Limited token coverage - consider adding more tokens"
        [[ $COLOR_COUNT -lt 6 ]]     && echo "     - Add more color tokens (minimum 6 recommended)"
        [[ $FONT_SIZE_COUNT -lt 5 ]] && echo "     - Add more font size tokens (minimum 5 recommended)"
        [[ $SPACING_COUNT -lt 6 ]]   && echo "     - Add more spacing tokens (minimum 6 recommended)"
    fi
else
    echo "## Tokens File Not Found"
    echo ""
    echo "  No tokens file at $TOKENS_FILE"
    echo "  Create tokens.json with the recommended tokens from the analysis above"
fi

echo ""
echo "---"
echo ""

# --- Summary ---
echo "## Summary"
echo ""

HARDCODED_SPACING_COUNT=$(wc -l < "$SPACING_FILE" 2>/dev/null | tr -d ' ' || echo "0")
HARDCODED_FONT_SIZE_COUNT=$(wc -l < "$FONT_SIZES_FILE" 2>/dev/null | tr -d ' ' || echo "0")
HARDCODED_COLOR_COUNT=$(wc -l < "$COLORS_FILE" 2>/dev/null | tr -d ' ' || echo "0")

TOTAL_HARDCODED=$((HARDCODED_SPACING_COUNT + HARDCODED_FONT_SIZE_COUNT + HARDCODED_COLOR_COUNT))

echo "Total hardcoded values found: $TOTAL_HARDCODED"
echo "  - Spacing: $HARDCODED_SPACING_COUNT"
echo "  - Font sizes: $HARDCODED_FONT_SIZE_COUNT"
echo "  - Colors: $HARDCODED_COLOR_COUNT"
echo ""

if [[ $TOTAL_HARDCODED -eq 0 ]]; then
    echo "EXCELLENT: Zero hardcoded values! All generated output uses design tokens."
elif [[ $TOTAL_HARDCODED -le 10 ]]; then
    echo "GOOD: Few hardcoded values. Review the recommendations above to promote them to tokens."
else
    echo "NEEDS WORK: Many hardcoded values. Generated output should reference tokens exclusively."
    echo ""
    echo "Next steps:"
    echo "1. Add the recommended tokens to tokens.json"
    echo "2. Re-run the plan compile so the translation picks them up"
    echo "3. Re-run this script to verify improvements"
fi

echo ""

exit 0
