#!/usr/bin/env bash
# Pre-publish validation gate.
#
# Usage:
#   pre-publish-checks.sh [--plan <file>] [--strict]
#
# Runs:
#   1. Credentials present (WIX_API_KEY + WIX_SITE_ID; skipped in dry-run)
#   2. BuildPlan exists and passes plan-lint
#   3. Dry-run apply passes (vespasian apply <plan> --dry-run, when the CLI has it)
#   4. QA report freshness (FidelityReport / QA output < 24h old — warn)
#   5. Dependency vulnerability scan
#   6. Secret hygiene (.env / session state not tracked by git)
#
# Exit codes:
#   0 — all checks passed
#   1 — at least one blocking failure
#   2 — script invocation error

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/common.sh"

PLAN_FILE=""
STRICT=false
FAILURES=0

usage() {
  cat <<EOF
Usage: $(basename "$0") [--plan FILE] [--strict]

  --plan FILE   BuildPlan to validate (default: newest .vespasian/plans/*.json)
  --strict      treat warnings as failures
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --plan) PLAN_FILE="$2"; shift 2 ;;
    --strict) STRICT=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) log_error "Unknown argument: $1"; usage; exit 2 ;;
  esac
done

banner "Pre-publish checks (strict=$STRICT)"

run_check() {
  local name="$1"; shift
  log_step "$name"
  if "$@"; then
    log_ok "$name passed"
  else
    log_error "$name FAILED"
    FAILURES=$((FAILURES + 1))
  fi
}

run_warn_check() {
  local name="$1"; shift
  log_step "$name"
  if "$@"; then
    log_ok "$name passed"
  else
    log_warn "$name produced warnings"
    if $STRICT; then FAILURES=$((FAILURES + 1)); fi
  fi
}

# Resolve the plan file once.
if [[ -z "$PLAN_FILE" ]]; then
  PLAN_FILE="$(ls -t "$PROJECT_ROOT"/.vespasian/plans/*.json 2>/dev/null | head -1 || true)"
fi

# 1. Credentials ----------------------------------------------------------------
check_credentials() {
  if [[ "${VESPASIAN_DRY_RUN:-}" == "1" ]]; then
    log_info "VESPASIAN_DRY_RUN=1 — credential check skipped"
    return 0
  fi
  # Pick up .env like the CLI does
  if [[ -f "$PROJECT_ROOT/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$PROJECT_ROOT/.env" 2>/dev/null || true
    set +a
  fi
  local ok=0
  [[ -n "${WIX_API_KEY:-}" ]] || { log_error "WIX_API_KEY not set"; ok=1; }
  [[ -n "${WIX_SITE_ID:-}" ]] || { log_error "WIX_SITE_ID not set (vespasian site use <id>)"; ok=1; }
  return $ok
}

# 2. BuildPlan lint ---------------------------------------------------------------
check_plan() {
  if [[ -z "$PLAN_FILE" || ! -f "$PLAN_FILE" ]]; then
    log_error "No BuildPlan found (.vespasian/plans/). Compile one: vespasian plan <ir>"
    return 1
  fi
  log_info "Plan: $PLAN_FILE"
  "$PROJECT_ROOT/scripts/shared/plan-lint.sh" "$PLAN_FILE" >/dev/null
}

# 3. Dry-run apply ---------------------------------------------------------------
check_dry_run_apply() {
  [[ -n "$PLAN_FILE" && -f "$PLAN_FILE" ]] || { log_warn "no plan — dry-run apply skipped"; return 1; }
  local cli="$PROJECT_ROOT/bin/vespasian.mjs"
  if [[ ! -f "$cli" ]] || ! command -v node >/dev/null 2>&1; then
    log_warn "vespasian CLI not available — dry-run apply skipped"
    return 1
  fi
  if ! node "$cli" --help 2>&1 | grep -qE '(^|[[:space:]])apply([[:space:]]|$)'; then
    log_warn "CLI has no apply subcommand yet — dry-run apply skipped"
    return 1
  fi
  VESPASIAN_DRY_RUN=1 node "$cli" apply "$PLAN_FILE" --dry-run >/dev/null
}

# 4. QA report freshness -----------------------------------------------------------
check_qa_freshness() {
  local newest=""
  newest="$(find "$PROJECT_ROOT/.vespasian/qa" "$PROJECT_ROOT/.claude/reports" \
      -type f \( -name '*fidelity*' -o -name '*comparison*' -o -name '*qa*' \) \
      -mtime -1 2>/dev/null | head -1 || true)"
  if [[ -z "$newest" ]]; then
    log_warn "No QA/fidelity report newer than 24h — run: vespasian qa"
    return 1
  fi
  log_info "Fresh QA artifact: $newest"
  return 0
}

# 5. Dependency vulnerability scan ---------------------------------------------
check_dependencies() {
  local script="$PROJECT_ROOT/scripts/security-audit/scan-dependencies.sh"
  [[ -x "$script" ]] || { log_warn "scan-dependencies.sh not found, skipping"; return 0; }
  if "$script" "$PROJECT_ROOT" >/dev/null 2>&1; then
    return 0
  fi
  local rc=$?
  case $rc in
    1) log_error "Dependency scanner found vulnerabilities"; return 1 ;;
    *) log_warn  "Dependency scanner exited with code $rc"; return 0 ;;
  esac
}

# 6. Secret hygiene ---------------------------------------------------------------
check_secrets() {
  local failed=0
  if command -v git >/dev/null 2>&1 && git -C "$PROJECT_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    if git -C "$PROJECT_ROOT" ls-files --error-unmatch .env >/dev/null 2>&1; then
      log_error ".env is tracked by git — remove it from the index (git rm --cached .env)"
      failed=1
    fi
    if git -C "$PROJECT_ROOT" ls-files | grep -q '^\.vespasian/session/'; then
      log_error ".vespasian/session/ state is tracked by git — never commit editor sessions"
      failed=1
    fi
  fi
  return $failed
}

run_check      "Credentials"           check_credentials
run_check      "BuildPlan lint"        check_plan
run_warn_check "Dry-run apply"         check_dry_run_apply
run_warn_check "QA report freshness"   check_qa_freshness
run_check      "Dependency scan"       check_dependencies
run_check      "Secret hygiene"        check_secrets

if [[ $FAILURES -gt 0 ]]; then
  log_error "$FAILURES pre-publish check(s) failed"
  log_event "pre_publish_failed" "failures=$FAILURES"
  exit 1
fi

log_ok "All pre-publish checks passed"
log_event "pre_publish_ok" ""
