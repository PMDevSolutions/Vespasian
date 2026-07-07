#!/usr/bin/env bash
# Wix publish orchestrator.
#
# The entry point used by the deployment-agent and humans alike. Runs the
# pre-publish gate, then publishes the target Wix site — via the vespasian CLI
# when its `publish` subcommand is available, otherwise directly against the
# Site Publisher REST API — and fans out notifications.
#
# Publishing ships the CURRENT SAVED EDITOR STATE of the site. Run
# `vespasian apply` (and let editor steps finish) before publishing.
#
# Usage:
#   publish.sh [--env <name>] [--dry-run] [--skip-checks]
#              [--release-id ID] [--actor NAME] [--message TEXT]
#
#   --env NAME       optional environment config from .claude/config/deployment/
#                    (sets/overrides WIX_SITE_ID, notification channels, ...).
#                    Without it, WIX_* env vars / .env are used directly.
#   --dry-run        print the plan without publishing (also implied by
#                    VESPASIAN_DRY_RUN=1)
#   --skip-checks    skip the pre-publish gate (NOT recommended)
#
# Exit codes:
#   0 — success
#   1 — publish failed
#   2 — invocation error

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/config-loader.sh"

ENV_NAME=""
DRY_RUN=false
SKIP_CHECKS=false
RELEASE_ID=""
ACTOR="${USER:-unknown}"
MESSAGE=""

usage() {
  sed -n '4,25p' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENV_NAME="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --skip-checks) SKIP_CHECKS=true; shift ;;
    --release-id) RELEASE_ID="$2"; shift 2 ;;
    --actor) ACTOR="$2"; shift 2 ;;
    --message) MESSAGE="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) log_error "Unknown argument: $1"; usage; exit 2 ;;
  esac
done

[[ "${VESPASIAN_DRY_RUN:-}" == "1" ]] && DRY_RUN=true

# Load .env so WIX_* credentials behave like they do for the CLI.
if [[ -f "$PROJECT_ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_ROOT/.env" 2>/dev/null || true
  set +a
fi

# Optional environment config (site id + notification channels).
if [[ -n "$ENV_NAME" ]]; then
  load_environment_config "$ENV_NAME"
  # Config may pin the target site; env vars win when both are set.
  WIX_SITE_ID="${WIX_SITE_ID:-${DEPLOY_CFG_WIX_SITE_ID:-}}"
  export WIX_SITE_ID
fi

RELEASE_ID="${RELEASE_ID:-$(generate_release_id)}"
export DEPLOY_RELEASE_ID="$RELEASE_ID"
export DEPLOY_ACTOR="$ACTOR"

TARGET_LABEL="${ENV_NAME:-default}"

banner "Publish → Wix site (env=$TARGET_LABEL, release=$RELEASE_ID)"
log_event "publish_plan" "env=$TARGET_LABEL release=$RELEASE_ID actor=$ACTOR"

# Does the vespasian CLI expose `publish` yet?
CLI="$PROJECT_ROOT/bin/vespasian.mjs"
CLI_HAS_PUBLISH=false
if [[ -f "$CLI" ]] && command -v node >/dev/null 2>&1; then
  if node "$CLI" --help 2>&1 | grep -qE '(^|[[:space:]])publish([[:space:]]|$)'; then
    CLI_HAS_PUBLISH=true
  fi
fi

if $DRY_RUN; then
  cat <<EOF
[DRY RUN]
  environment   : $TARGET_LABEL
  config file   : ${DEPLOY_CFG_SOURCE_FILE:-"(none — env vars only)"}
  site id       : ${WIX_SITE_ID:+set}${WIX_SITE_ID:-MISSING}
  api key       : ${WIX_API_KEY:+set}${WIX_API_KEY:-MISSING}
  release id    : $RELEASE_ID
  publish via   : $($CLI_HAS_PUBLISH && echo "vespasian publish (CLI)" || echo "REST site-publisher (curl)")
  log file      : $DEPLOY_LOG_FILE
  actor         : $ACTOR
  pre-checks    : $($SKIP_CHECKS && echo skipped || echo enabled)
EOF
  log_event "publish_dry_run_complete" "env=$TARGET_LABEL"
  exit 0
fi

# Notify-on-start (best-effort; skipped when no env config carries channels)
if [[ -n "$ENV_NAME" ]]; then
  "$SCRIPT_DIR/notify.sh" --env "$ENV_NAME" --status started \
    --release-id "$RELEASE_ID" --actor "$ACTOR" \
    --message "${MESSAGE:-Publish in progress}" || true
fi

notify() {
  local status="$1" msg="$2"
  [[ -n "$ENV_NAME" ]] || return 0
  "$SCRIPT_DIR/notify.sh" --env "$ENV_NAME" --status "$status" \
    --release-id "$RELEASE_ID" --actor "$ACTOR" --message "$msg" || true
}

# 1. Pre-publish gate ---------------------------------------------------------
if ! $SKIP_CHECKS; then
  log_step "Running pre-publish checks"
  if ! "$SCRIPT_DIR/pre-publish-checks.sh"; then
    log_error "Pre-publish checks failed — aborting"
    notify failed "Pre-publish checks failed"
    exit 1
  fi
else
  log_warn "Skipping pre-publish checks (--skip-checks)"
fi

# 2. Publish -------------------------------------------------------------------
publish_failed=0

if $CLI_HAS_PUBLISH; then
  log_step "Publishing via vespasian CLI"
  node "$CLI" publish || publish_failed=$?
else
  log_step "Publishing via REST (site-publisher API)"
  log_info "(bin/vespasian.mjs has no publish subcommand yet — using curl fallback)"

  [[ -n "${WIX_API_KEY:-}" ]] || { log_error "WIX_API_KEY is not set"; notify failed "Missing WIX_API_KEY"; exit 1; }
  [[ -n "${WIX_SITE_ID:-}" ]] || { log_error "WIX_SITE_ID is not set"; notify failed "Missing WIX_SITE_ID"; exit 1; }
  require_cmd curl || exit 2

  HTTP_CODE=$(curl -s -o /tmp/vespasian-publish-response.$$ -w "%{http_code}" \
    --connect-timeout 10 --max-time 60 \
    -X POST "https://www.wixapis.com/site-publisher/v1/site/publish" \
    -H "Authorization: ${WIX_API_KEY}" \
    -H "wix-site-id: ${WIX_SITE_ID}" \
    -H "Content-Type: application/json" \
    -d '{}' 2>/dev/null) || HTTP_CODE="000"

  case "$HTTP_CODE" in
    200) log_ok "Site published (HTTP 200)" ;;
    401|403)
      log_error "Publish auth failed (HTTP $HTTP_CODE) — check WIX_API_KEY scope/site access"
      publish_failed=1 ;;
    428)
      log_error "Publish refused (HTTP 428): the site has no publishable structure yet — run vespasian apply first"
      publish_failed=1 ;;
    429)
      log_error "Rate limited (HTTP 429) — wait and retry"
      publish_failed=1 ;;
    000)
      log_error "Could not reach www.wixapis.com"
      publish_failed=1 ;;
    *)
      log_error "Publish returned HTTP $HTTP_CODE"
      sed -e 's/^/    /' /tmp/vespasian-publish-response.$$ >&2 2>/dev/null || true
      publish_failed=1 ;;
  esac
  rm -f /tmp/vespasian-publish-response.$$
fi

if [[ $publish_failed -ne 0 ]]; then
  log_error "Publish failed (exit $publish_failed)"
  log_warn "There is no automatic rollback on Wix — see rollback.sh for the manual Site History path."
  notify failed "${MESSAGE:-Publish failed}"
  exit 1
fi

# 3. Post-publish verification ---------------------------------------------------
if [[ -n "${WIX_SITE_URL:-}" ]] && [[ -x "$PROJECT_ROOT/scripts/shared/verify-published.sh" ]]; then
  log_step "Verifying published site"
  if "$PROJECT_ROOT/scripts/shared/verify-published.sh" "$WIX_SITE_URL"; then
    log_ok "Published site verified"
  else
    log_warn "Published-site verification reported issues — inspect $WIX_SITE_URL"
  fi
else
  log_info "Set WIX_SITE_URL to enable automatic post-publish verification"
fi

# 4. Success --------------------------------------------------------------------
log_ok "Publish complete: release=$RELEASE_ID"
log_event "publish_ok" "env=$TARGET_LABEL release=$RELEASE_ID"

notify success "${MESSAGE:-Publish successful}"

log_info "Log: $DEPLOY_LOG_FILE"
