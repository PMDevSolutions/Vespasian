#!/usr/bin/env bash
# scripts/visual-capture.sh
#
# Capture visual regression screenshots of the published Wix site into
# tests/visual/actual/. The page/breakpoint matrix lives in
# tests/visual/urls.json; the target site comes from WIX_SITE_URL (or --url).
#
# There is no local stack to boot — Vespasian's output is a live Wix site.
# For deterministic content, apply the fixture BuildPlan first (vespasian
# apply) so pages/CMS data are in a known state; see tests/visual/seed.sh.
#
# Flags:
#   --url <url>    Target site (overrides WIX_SITE_URL)
#   --only <slug>  Capture a single page by slug (matches urls.json pages[].slug)
#
# Exit codes: 0 = success, 1 = capture failed, 2 = environment problem.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

ONLY_ARG=""
URL="${WIX_SITE_URL:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --url)  URL="$2"; shift 2 ;;
    --only) ONLY_ARG="--only $2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--url <site-url>] [--only <slug>]"
      exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$URL" ]; then
  echo "ERROR: no target site." >&2
  echo "Set WIX_SITE_URL (or pass --url) to the published Wix site, e.g." >&2
  echo "  WIX_SITE_URL=https://mysite.wixsite.com/home $0" >&2
  exit 2
fi

# --- Ensure pnpm is available ---
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. Install via corepack: corepack enable && corepack prepare pnpm@9.15.0 --activate" >&2
  exit 2
fi

# --- Install Node deps + Playwright Chromium ---
echo "Installing Node dependencies"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

if [ ! -d "$(pnpm exec node -p 'require("path").dirname(require.resolve("playwright/package.json"))' 2>/dev/null)/.local-browsers" ]; then
  echo "Installing Playwright Chromium"
  pnpm exec playwright install chromium
fi

# --- Capture ---
echo "Capturing screenshots from $URL"
# shellcheck disable=SC2086
WIX_SITE_URL="$URL" pnpm exec node tests/visual/capture.mjs --out tests/visual/actual $ONLY_ARG

echo ""
echo "Screenshots written to tests/visual/actual/"
echo "  Compare:  pnpm visual:diff"
echo "  Accept:   pnpm visual:update"
