#!/bin/bash
# Figma Design Token Extractor — PostToolUse hook
# Validates extracted design tokens (tokens.json) for design-system coverage.
#
# Vespasian's token artifact is the neutral mapTokens shape consumed by
# packages/wix-driver/src/translate:
#   { "palette": [...], "fontFamilies": [...], "fontSizes": [...], "spacingSizes": [...] }
# A settings-wrapped shape ({ settings: { color/typography/spacing } }) is also
# accepted (the translator normalizes both).
#
# Warn-only: always exits 0.

# Read JSON input from stdin (if provided by hook)
INPUT=$(cat)

# Extract file path if provided (for validation after tokens.json creation)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# Only check tokens.json files
if [[ "$FILE_PATH" != *"tokens.json" ]]; then
    exit 0
fi

# Check if file exists
if [[ ! -f "$FILE_PATH" ]]; then
    exit 0
fi

echo "Validating design token extraction: $FILE_PATH" >&2

# Validate JSON syntax
if ! jq empty "$FILE_PATH" 2>/dev/null; then
    echo "" >&2
    echo "ERROR: Invalid JSON syntax in tokens file" >&2
    exit 0
fi

# Accept both the flat mapTokens shape and the settings-wrapped shape.
COLOR_COUNT=$(jq -r '(.palette // .settings.color.palette // []) | length' "$FILE_PATH" 2>/dev/null)
FONT_FAMILY_COUNT=$(jq -r '(.fontFamilies // .settings.typography.fontFamilies // []) | length' "$FILE_PATH" 2>/dev/null)
FONT_SIZE_COUNT=$(jq -r '(.fontSizes // .settings.typography.fontSizes // []) | length' "$FILE_PATH" 2>/dev/null)
SPACING_COUNT=$(jq -r '(.spacingSizes // .settings.spacing.spacingSizes // []) | length' "$FILE_PATH" 2>/dev/null)

# Check for missing token groups
MISSING_GROUPS=()
[ "$COLOR_COUNT" -eq 0 ] && MISSING_GROUPS+=("palette")
[ "$FONT_SIZE_COUNT" -eq 0 ] && MISSING_GROUPS+=("fontSizes")
[ "$SPACING_COUNT" -eq 0 ] && MISSING_GROUPS+=("spacingSizes")

if [ ${#MISSING_GROUPS[@]} -gt 0 ]; then
    echo "" >&2
    echo "WARNING: Missing token groups:" >&2
    for group in "${MISSING_GROUPS[@]}"; do
        echo "   - $group" >&2
    done
    echo "" >&2
fi

echo "" >&2
echo "Design Token Summary:" >&2
echo "   Colors: $COLOR_COUNT" >&2
echo "   Font Families: $FONT_FAMILY_COUNT" >&2
echo "   Font Sizes: $FONT_SIZE_COUNT" >&2
echo "   Spacing Tokens: $SPACING_COUNT" >&2

# Check for minimum token counts (design system should be comprehensive)
WARNINGS=()

if [ "$COLOR_COUNT" -lt 6 ]; then
    WARNINGS+=("Only $COLOR_COUNT colors defined. Consider extracting the complete color palette (6+ colors).")
fi

if [ "$FONT_SIZE_COUNT" -lt 5 ]; then
    WARNINGS+=("Only $FONT_SIZE_COUNT font sizes defined. Consider extracting the complete typography scale (5+ sizes).")
fi

if [ "$SPACING_COUNT" -lt 6 ]; then
    WARNINGS+=("Only $SPACING_COUNT spacing tokens defined. Consider extracting the complete spacing scale (6+ tokens).")
fi

if [ ${#WARNINGS[@]} -gt 0 ]; then
    echo "" >&2
    echo "Design System Warnings:" >&2
    for warning in "${WARNINGS[@]}"; do
        echo "   - $warning" >&2
    done
    echo "" >&2
    echo "A comprehensive token set keeps the Wix translation lossless: sparse" >&2
    echo "palettes waste theme slots and sparse spacing scales produce a thin" >&2
    echo "--vsp-space-* ramp in global.css." >&2
else
    echo "" >&2
    echo "Comprehensive design system detected" >&2
fi

# Wix translation limits (see docs/wix/theming.md):
#   - the palette compresses into a fixed number of site color slots
#   - the text theme has 9 slots (H1-H6, P1-P3); extra sizes spill into CSS classes
if [ "$COLOR_COUNT" -gt 18 ]; then
    echo "" >&2
    echo "NOTE: $COLOR_COUNT colors will be compressed into Wix theme slots;" >&2
    echo "   overflow shades are written to global.css. Check the FidelityReport." >&2
fi

if [ "$FONT_SIZE_COUNT" -gt 9 ]; then
    echo "" >&2
    echo "NOTE: $FONT_SIZE_COUNT font sizes exceed the 9-slot Wix text theme;" >&2
    echo "   overflow styles become .vsp-* utility classes in global.css." >&2
fi

echo "" >&2
echo "Design token validation complete." >&2

# Always exit 0 (warn, don't block)
exit 0
