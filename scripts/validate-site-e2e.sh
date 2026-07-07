#!/bin/bash
# Vespasian Site End-to-End Validation Script
#
# Comprehensive validation of a built-and-published Wix site:
#   - Pre-flight: BuildPlan lint + dry-run apply (via validate-site.sh)
#   - Published-page verification (HTTP smoke checks)
#   - Visual validation (responsive screenshot capture)
#   - Performance validation (Lighthouse, when lhci is installed)
#   - Cross-browser capture (Playwright; --full runs firefox + webkit too)
#
# Usage:
#   ./scripts/validate-site-e2e.sh [plan.json]
#   ./scripts/validate-site-e2e.sh --url <published-url>   # override WIX_SITE_URL
#   ./scripts/validate-site-e2e.sh --skip-live             # offline: plan + dry-run only
#   ./scripts/validate-site-e2e.sh --full                  # all browser engines
#
# Live stages need WIX_SITE_URL (or --url); without it they are skipped with a
# clear message and the script validates what it can offline.
#
# Exit codes:
#   0 = All checks passed
#   1 = Warnings but passed
#   2 = Critical failures

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLAN_FILE=""
URL="${WIX_SITE_URL:-}"
SKIP_LIVE=false
FULL_BROWSER=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
WARN=0
FAIL=0

while [[ $# -gt 0 ]]; do
    case $1 in
        --url) URL="$2"; shift 2 ;;
        --skip-live) SKIP_LIVE=true; shift ;;
        --full) FULL_BROWSER=true; shift ;;
        -h|--help)
            sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
            exit 0 ;;
        -*) shift ;;
        *) PLAN_FILE="$1"; shift ;;
    esac
done

print_header() {
    echo ""
    echo -e "${BLUE}===========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}===========================================${NC}"
}

check_pass() { PASS=$((PASS + 1)); echo -e "  ${GREEN}PASS${NC}: $1"; }
check_warn() { WARN=$((WARN + 1)); echo -e "  ${YELLOW}WARN${NC}: $1"; }
check_fail() { FAIL=$((FAIL + 1)); echo -e "  ${RED}FAIL${NC}: $1"; }

print_header "Stage 1: Plan validation + dry-run apply"

if "$PROJECT_ROOT/scripts/validate-site.sh" ${PLAN_FILE:+"$PLAN_FILE"}; then
    check_pass "validate-site.sh passed"
else
    check_fail "validate-site.sh reported failures"
fi

# --- Live stages ---
if $SKIP_LIVE; then
    echo ""
    echo "Live stages skipped (--skip-live)."
elif [ -z "$URL" ]; then
    echo ""
    check_warn "WIX_SITE_URL not set — live stages (HTTP, visual, Lighthouse, cross-browser) skipped."
    echo "  Set WIX_SITE_URL to the published site (or pass --url) to run them."
else
    print_header "Stage 2: Published-page verification"
    if "$PROJECT_ROOT/scripts/shared/verify-published.sh" "$URL"; then
        check_pass "published pages respond cleanly"
    else
        check_fail "published-page verification failed"
    fi

    print_header "Stage 3: Responsive screenshots"
    if "$PROJECT_ROOT/scripts/check-responsive.sh" "$URL"; then
        check_pass "responsive capture completed (.claude/visual-qa/screenshots/responsive)"
    else
        check_warn "responsive capture failed (Playwright installed? URL reachable?)"
    fi

    print_header "Stage 4: Lighthouse"
    if command -v npx >/dev/null 2>&1 && npx --no-install lhci --version >/dev/null 2>&1; then
        if npx --no-install lhci collect --url="$URL" --numberOfRuns=1 >/dev/null 2>&1; then
            check_pass "Lighthouse collected (assert with: pnpm lighthouse:assert)"
        else
            check_warn "Lighthouse collection failed"
        fi
    else
        check_warn "lhci not installed — run pnpm install to enable Lighthouse checks"
    fi

    print_header "Stage 5: Cross-browser capture"
    BROWSERS=(chromium)
    $FULL_BROWSER && BROWSERS=(chromium firefox webkit)
    for b in "${BROWSERS[@]}"; do
        if "$PROJECT_ROOT/scripts/cross-browser-test.sh" "$b" "$URL"; then
            check_pass "$b capture completed"
        else
            check_warn "$b capture failed (browser installed? ./scripts/setup-playwright.sh)"
        fi
    done
fi

# --- Summary ---
print_header "Summary"
echo "  Passed:   $PASS"
echo "  Warnings: $WARN"
echo "  Failed:   $FAIL"
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}E2E validation: CRITICAL FAILURES${NC}"
    exit 2
elif [ "$WARN" -gt 0 ]; then
    echo -e "${YELLOW}E2E validation: passed with warnings${NC}"
    exit 1
fi
echo -e "${GREEN}E2E validation: all checks passed${NC}"
exit 0
