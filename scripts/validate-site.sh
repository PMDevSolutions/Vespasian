#!/bin/bash
# Unified Site Validation Orchestrator
# Runs ALL validation checks on a Vespasian build (BuildPlan + tokens +
# staged output) in sequence.
#
# Usage:
#   ./scripts/validate-site.sh [plan.json]
#   ./scripts/validate-site.sh [plan.json] --strict   (exit on first error)
#   ./scripts/validate-site.sh [plan.json] --report   (save report to .claude/reports/)
#
# Without an argument, the newest plan under .vespasian/plans/ is validated.
#
# Checks run:
#   1. BuildPlan lint (schema, method/phase enums, phase ordering)
#   2. Design tokens present + coverage (tokens.json)
#   3. Token compliance of staged output (no hardcoded values)
#   4. Dry-run apply through the vespasian CLI (when available)
#   5. Published-site smoke check (when WIX_SITE_URL is set)
#
# Exit codes: 0 = pass (warnings allowed), 1 = failures, 2 = usage error

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLAN_FILE=""
STRICT=false
REPORT=false
REPORT_FILE=""

# Parse args
while [[ $# -gt 0 ]]; do
    case $1 in
        --strict) STRICT=true; shift ;;
        --report) REPORT=true; shift ;;
        -h|--help)
            sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
            exit 0 ;;
        -*) echo "Unknown option: $1" >&2; exit 2 ;;
        *) PLAN_FILE="$1"; shift ;;
    esac
done

if [ -z "$PLAN_FILE" ]; then
    # The pipeline writes plans to .vespasian/plans/<slug>/plan.json by default;
    # a --plan override can also land a bare .json directly under plans/.
    PLAN_FILE=$(ls -t "$PROJECT_ROOT"/.vespasian/plans/*/plan.json "$PROJECT_ROOT"/.vespasian/plans/*.json 2>/dev/null | head -1 || true)
fi

if [ -z "$PLAN_FILE" ] || [ ! -f "$PLAN_FILE" ]; then
    echo "No BuildPlan found."
    echo "Compile one first:  vespasian plan <ir>   (plans land in .vespasian/plans/)"
    echo "Or pass a plan file: $0 path/to/plan.json"
    exit 2
fi

PASS=0
WARN=0
FAIL=0

# Setup report
if [ "$REPORT" = true ]; then
    REPORT_DIR="$PROJECT_ROOT/.claude/reports/site-validation"
    mkdir -p "$REPORT_DIR"
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    REPORT_FILE="$REPORT_DIR/$(basename "$PLAN_FILE" .json)_${TIMESTAMP}.md"
    echo "# Site Validation Report — $(basename "$PLAN_FILE")" > "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
fi

# Output helper
log() {
    echo "$1"
    if [ "$REPORT" = true ]; then
        echo "$1" >> "$REPORT_FILE"
    fi
    return 0
}

check_pass() { PASS=$((PASS + 1)); log "  PASS: $1"; }
check_warn() { WARN=$((WARN + 1)); log "  WARN: $1"; }
check_fail() {
    FAIL=$((FAIL + 1)); log "  FAIL: $1"
    if [ "$STRICT" = true ]; then
        log ""
        log "Aborting (--strict): fix the failure above and re-run."
        exit 1
    fi
}

log "=== Site Validation: $PLAN_FILE ==="
log ""

# --- 1. BuildPlan lint ---
log "[1/5] BuildPlan lint"
if OUTPUT=$("$PROJECT_ROOT/scripts/shared/plan-lint.sh" "$PLAN_FILE" 2>&1); then
    check_pass "$OUTPUT"
else
    check_fail "plan-lint reported errors:"
    log "$(echo "$OUTPUT" | sed 's/^/    /')"
fi
log ""

# --- 2. Design tokens ---
log "[2/5] Design tokens"
TOKENS_FILE=""
for candidate in "$PROJECT_ROOT/.vespasian/tokens.json" "$(dirname "$PLAN_FILE")/tokens.json"; do
    [ -f "$candidate" ] && TOKENS_FILE="$candidate" && break
done

if [ -n "$TOKENS_FILE" ]; then
    if jq empty "$TOKENS_FILE" 2>/dev/null; then
        COLORS=$(jq -r '(.palette // .settings.color.palette // []) | length' "$TOKENS_FILE")
        SIZES=$(jq -r '(.fontSizes // .settings.typography.fontSizes // []) | length' "$TOKENS_FILE")
        SPACES=$(jq -r '(.spacingSizes // .settings.spacing.spacingSizes // []) | length' "$TOKENS_FILE")
        check_pass "tokens.json valid ($COLORS colors, $SIZES font sizes, $SPACES spacing)"
        if [ "$COLORS" -lt 3 ] || [ "$SIZES" -lt 3 ] || [ "$SPACES" -lt 3 ]; then
            check_warn "token coverage is thin — the Wix theme translation will be sparse"
        fi
    else
        check_fail "tokens.json is not valid JSON ($TOKENS_FILE)"
    fi
else
    check_warn "no tokens.json found (.vespasian/tokens.json) — plan may carry inline tokens"
fi
log ""

# --- 3. Token compliance of staged output ---
log "[3/5] Token compliance (staged output)"
STAGE_DIR="$PROJECT_ROOT/.vespasian/dryrun/site-repo"
if [ -d "$STAGE_DIR" ]; then
    HARDCODED=$(find "$STAGE_DIR" -type f \( -name '*.css' -o -name '*.html' \) ! -path '*/styles/global.css' \
        -exec grep -l '#[0-9A-Fa-f]\{6\}' {} \; 2>/dev/null | wc -l | tr -d ' ')
    if [ "$HARDCODED" -eq 0 ]; then
        check_pass "no hardcoded colors outside global.css"
    else
        check_warn "$HARDCODED staged file(s) contain literal hex colors — run scripts/figma-wix/optimize-tokens.sh $STAGE_DIR"
    fi
else
    check_warn "no staged output at $STAGE_DIR (run a dry-run apply to populate it)"
fi
log ""

# --- 4. Dry-run apply ---
log "[4/5] Dry-run apply"
CLI="$PROJECT_ROOT/bin/vespasian.mjs"
if [ -f "$CLI" ] && command -v node >/dev/null 2>&1 && node "$CLI" --help 2>&1 | grep -qE '(^|[[:space:]])apply([[:space:]]|$)'; then
    if VESPASIAN_DRY_RUN=1 node "$CLI" apply "$PLAN_FILE" --dry-run >/dev/null 2>&1; then
        check_pass "dry-run apply completed (recording transports, no network)"
    else
        check_fail "dry-run apply failed — run: VESPASIAN_DRY_RUN=1 vespasian apply $PLAN_FILE --dry-run"
    fi
else
    check_warn "vespasian CLI apply not available — dry-run apply skipped"
fi
log ""

# --- 5. Published-site smoke check ---
log "[5/5] Published site"
if [ -n "${WIX_SITE_URL:-}" ]; then
    if "$PROJECT_ROOT/scripts/shared/verify-published.sh" "$WIX_SITE_URL" >/dev/null 2>&1; then
        check_pass "published site responds cleanly ($WIX_SITE_URL)"
    else
        check_warn "published-site check failed — run: scripts/shared/verify-published.sh $WIX_SITE_URL"
    fi
else
    check_warn "WIX_SITE_URL not set — published-site check skipped"
fi
log ""

# --- Summary ---
log "=== Summary ==="
log "  Passed:   $PASS"
log "  Warnings: $WARN"
log "  Failed:   $FAIL"
if [ "$REPORT" = true ]; then
    echo ""
    echo "Report saved: $REPORT_FILE"
fi

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
