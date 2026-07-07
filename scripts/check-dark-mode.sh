#!/bin/bash
# Dark mode screenshot capture and visual diff comparison
#
# Usage:
#   ./scripts/check-dark-mode.sh [url] [--output-dir <dir>]
#   ./scripts/check-dark-mode.sh https://mysite.wixsite.com/home
#   WIX_SITE_URL=https://mysite.wixsite.com/home ./scripts/check-dark-mode.sh
#
# The URL defaults to $WIX_SITE_URL — there is no localhost default.
#
# Captures dark mode screenshots using Playwright's colorScheme: 'dark' and
# compares them against light mode baselines via visual-diff.js.
#
# Exit codes: 0=within tolerance, 1=differences above threshold, 2=error

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="${WIX_SITE_URL:-}"
CUSTOM_OUTPUT_DIR=""

# Parse arguments
while [ $# -gt 0 ]; do
    case "$1" in
        --output-dir)
            CUSTOM_OUTPUT_DIR="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [url] [--output-dir <dir>]"
            echo "URL defaults to \$WIX_SITE_URL."
            exit 0
            ;;
        -*)
            echo "Error: Unknown option '$1'"
            echo "Usage: $0 [url] [--output-dir <dir>]"
            exit 2
            ;;
        *)
            URL="$1"
            shift
            ;;
    esac
done

if [ -z "$URL" ]; then
    echo "ERROR: no target URL." >&2
    echo "Pass a URL or set WIX_SITE_URL to the published site" >&2
    echo "(e.g. WIX_SITE_URL=https://mysite.wixsite.com/home)." >&2
    exit 2
fi

# Read config from pipeline.config.json when present; fall back to defaults.
CONFIG_FILE="$PROJECT_ROOT/.claude/pipeline.config.json"

read_config() {
    local expr="$1" fallback="$2"
    if [ -f "$CONFIG_FILE" ]; then
        node -e "const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf-8'));console.log($expr)" 2>/dev/null || echo "$fallback"
    else
        echo "$fallback"
    fi
}

DARK_ENABLED=$(read_config "c.darkMode?.enabled ?? true" "true")
DIFF_THRESHOLD=$(read_config "c.darkMode?.diffThreshold ?? 0.03" "0.03")
DARK_SCREENSHOT_DIR=$(read_config "c.darkMode?.screenshotDir ?? '.claude/visual-qa/screenshots/dark'" ".claude/visual-qa/screenshots/dark")
BREAKPOINTS_JSON=$(read_config "JSON.stringify(c.visualDiff?.breakpoints||{mobile:375,tablet:768,desktop:1440,wide:1920})" '{"mobile":375,"tablet":768,"desktop":1440,"wide":1920}')

# Check if dark mode is disabled
if [ "$DARK_ENABLED" = "false" ]; then
    echo "Dark mode visual verification is disabled in pipeline.config.json"
    exit 0
fi

# Resolve directories
DARK_DIR="$PROJECT_ROOT/$DARK_SCREENSHOT_DIR"
LIGHT_DIR="$PROJECT_ROOT/.claude/visual-qa/screenshots/wix/chromium"
DIFF_OUTPUT_DIR="${CUSTOM_OUTPUT_DIR:-$PROJECT_ROOT/.claude/visual-qa/diffs/dark-vs-light}"

# Verify light mode screenshots exist
if [ ! -d "$LIGHT_DIR" ]; then
    echo "Error: Light mode screenshots not found at $LIGHT_DIR"
    echo "Run cross-browser-test.sh with chromium first to capture light mode baselines."
    exit 2
fi

LIGHT_COUNT=$(find "$LIGHT_DIR" -name "*.png" 2>/dev/null | wc -l | tr -d ' ')
if [ "$LIGHT_COUNT" -eq 0 ]; then
    echo "Error: No light mode screenshots found in $LIGHT_DIR"
    echo "Run cross-browser-test.sh with chromium first to capture light mode baselines."
    exit 2
fi

mkdir -p "$DARK_DIR"
mkdir -p "$DIFF_OUTPUT_DIR"

echo "=== Dark Mode Visual Verification ==="
echo "URL: $URL"
echo "Light baselines: $LIGHT_DIR ($LIGHT_COUNT screenshots)"
echo "Dark screenshots: $DARK_DIR"
echo "Diff output: $DIFF_OUTPUT_DIR"
echo "Diff threshold: $DIFF_THRESHOLD"
echo ""

# Generate Playwright script for dark mode capture (portable mktemp)
SCRIPT_FILE=$(mktemp "${TMPDIR:-/tmp}/playwright-dark-mode-XXXXXX")
mv "$SCRIPT_FILE" "$SCRIPT_FILE.mjs"
SCRIPT_FILE="$SCRIPT_FILE.mjs"

cat > "$SCRIPT_FILE" << SCRIPT
import { chromium } from 'playwright';

const url = '$URL';
const outputDir = '$DARK_DIR';
const breakpoints = $BREAKPOINTS_JSON;

(async () => {
    const browser = await chromium.launch({ headless: true });

    for (const [name, width] of Object.entries(breakpoints)) {
        const context = await browser.newContext({
            viewport: { width: Number(width), height: 900 },
            colorScheme: 'dark'
        });
        const page = await context.newPage();

        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
            // Wait for dark mode CSS to fully apply
            await page.waitForTimeout(500);
            const filename = outputDir + '/' + name + '_' + width + 'px.png';
            await page.screenshot({ path: filename, fullPage: true });
            console.log('  Captured: ' + name + ' (' + width + 'px) [dark mode]');
        } catch (err) {
            console.error('  Failed: ' + name + ' (' + width + 'px) - ' + err.message);
        }

        await context.close();
    }

    await browser.close();
    console.log('');
    console.log('Dark mode screenshots saved to: ' + outputDir);
})();
SCRIPT

echo "=== Capturing Dark Mode Screenshots ==="
echo ""

node "$SCRIPT_FILE"
CAPTURE_EXIT=$?

# Cleanup temp script
rm -f "$SCRIPT_FILE"

if [ $CAPTURE_EXIT -ne 0 ]; then
    echo ""
    echo "Error: Dark mode screenshot capture failed"
    exit 2
fi

echo ""
echo "=== Comparing Dark vs Light Screenshots ==="
echo ""

# Run visual-diff.js in batch mode comparing dark vs light
node "$PROJECT_ROOT/scripts/visual-diff.js" \
    --batch "$DARK_DIR" "$LIGHT_DIR" \
    --output-dir "$DIFF_OUTPUT_DIR" \
    --threshold "$DIFF_THRESHOLD"
DIFF_EXIT=$?

echo ""
if [ $DIFF_EXIT -eq 0 ]; then
    echo "=== Result: Dark mode within tolerance (threshold: $DIFF_THRESHOLD) ==="
elif [ $DIFF_EXIT -eq 1 ]; then
    echo "=== Result: Dark mode differences detected above threshold ==="
    echo "Review diff images in: $DIFF_OUTPUT_DIR"
else
    echo "=== Result: Error during visual comparison ==="
fi

exit $DIFF_EXIT
