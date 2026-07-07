#!/usr/bin/env bash
# check-responsive.sh — Capture screenshots at all breakpoints using Playwright
#
# Target URL comes from the first argument or the WIX_SITE_URL env var — there
# is no localhost default (Vespasian's output is a published Wix site).
#
# Usage: check-responsive.sh [url] [output-dir]
# Exit codes: 0=success, 1=error, 2=no URL provided
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# --- Help ---
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  echo "Usage: check-responsive.sh [url] [output-dir]"
  echo ""
  echo "  url         URL to capture (default: \$WIX_SITE_URL)"
  echo "  output-dir  Screenshot output directory (default: .claude/visual-qa/screenshots/responsive)"
  echo ""
  echo "Breakpoints default to the Wix Studio set (mobile 375 / tablet 768 /"
  echo "desktop 1440 / wide 1920, plus 320); .claude/pipeline.config.json"
  echo "visualDiff.breakpoints overrides them when present."
  exit 0
fi

# --- Args ---
URL="${1:-${WIX_SITE_URL:-}}"
OUTPUT_DIR="${2:-.claude/visual-qa/screenshots/responsive}"

if [[ -z "$URL" ]]; then
  echo "ERROR: no target URL." >&2
  echo "Pass a URL or set WIX_SITE_URL to the published site" >&2
  echo "(e.g. WIX_SITE_URL=https://mysite.wixsite.com/home)." >&2
  exit 2
fi

echo "=== Responsive Screenshot Capture ==="
echo ""

# --- Read breakpoints from pipeline config (optional) ---
CONFIG_FILE=".claude/pipeline.config.json"
FALLBACK_BREAKPOINTS='{"small-mobile":320,"mobile":375,"tablet":768,"desktop":1440,"wide":1920}'

BREAKPOINTS_JSON=$(node -e "
  const fs = require('fs');
  const fallback = $FALLBACK_BREAKPOINTS;
  try {
    const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
    const bp = config.visualDiff?.breakpoints;
    if (bp && Object.keys(bp).length > 0) {
      console.log(JSON.stringify(bp));
    } else {
      console.log(JSON.stringify(fallback));
    }
  } catch (e) {
    console.log(JSON.stringify(fallback));
  }
" 2>/dev/null || echo "$FALLBACK_BREAKPOINTS")

echo "URL: $URL"
echo "Output: $OUTPUT_DIR"
echo "Breakpoints: $BREAKPOINTS_JSON"
echo ""

# --- Ensure output directory exists ---
mkdir -p "$OUTPUT_DIR"

# --- Ensure Playwright is available ---
if ! npx playwright --version &>/dev/null; then
  echo "  Playwright not found. Install with: pnpm install && pnpm playwright:install"
  exit 1
fi

# --- Generate temporary Playwright script (portable mktemp) ---
TEMP_SCRIPT=$(mktemp "${TMPDIR:-/tmp}/vespasian-responsive-XXXXXX")
mv "$TEMP_SCRIPT" "$TEMP_SCRIPT.mjs"
TEMP_SCRIPT="$TEMP_SCRIPT.mjs"
trap 'rm -f "$TEMP_SCRIPT"' EXIT

cat > "$TEMP_SCRIPT" <<'PLAYWRIGHT_EOF'
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const url = process.argv[2];
const outputDir = process.argv[3];
const breakpoints = JSON.parse(process.argv[4]);

mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch();
const entries = Object.entries(breakpoints);

for (const [name, width] of entries) {
  const page = await browser.newPage({
    viewport: { width: Number(width), height: 900 },
  });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  const filename = `${name}-${width}px.png`;
  await page.screenshot({
    path: join(outputDir, filename),
    fullPage: true,
  });
  await page.close();
  console.log(`captured ${filename} (${width}px)`);
}

await browser.close();
PLAYWRIGHT_EOF

# --- Run screenshot capture ---
echo "Capturing screenshots..."
echo ""

node "$TEMP_SCRIPT" "$URL" "$OUTPUT_DIR" "$BREAKPOINTS_JSON" || {
  echo ""
  echo "  Screenshot capture failed"
  echo "  Make sure the target URL is accessible and Playwright browsers are installed"
  exit 1
}

echo ""
echo "=== Summary ==="
echo "Responsive screenshots saved -> $OUTPUT_DIR/"
exit 0
