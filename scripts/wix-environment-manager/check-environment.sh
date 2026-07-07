#!/bin/bash
# Wix Environment Check - SubagentStart hook
# Reports the state of the Wix credentials, API reachability, and the editor
# automation session so the wix-environment-manager agent starts with an
# accurate picture. Informational only — always exits 0 and skips cleanly
# when credentials are absent (e.g. dry-run CI).
#
# Checks:
#   1. Env vars: WIX_API_KEY set, WIX_ACCOUNT_ID / WIX_SITE_ID GUID-shaped
#   2. API reachability: GET site-properties via curl (only with creds, never in dry-run)
#   3. Editor session: storageState file existence + freshness

echo "" >&2
echo "Wix Environment Check" >&2
echo "------------------------------" >&2

GUID_RE='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

# Load .env when present so the hook sees the same environment the CLI does.
if [ -f ".env" ]; then
    set -a
    # shellcheck disable=SC1091
    source .env 2>/dev/null || true
    set +a
fi

# --- 1. Environment variables (report presence/shape, NEVER values) ---
echo "  Credentials:" >&2

if [ -n "${WIX_API_KEY:-}" ]; then
    echo "    WIX_API_KEY: set (${#WIX_API_KEY} chars)" >&2
else
    echo "    WIX_API_KEY: NOT SET — API plane unavailable" >&2
fi

check_guid() {
    local name="$1" value="$2" required="$3"
    if [ -z "$value" ]; then
        if [ "$required" = "required" ]; then
            echo "    $name: NOT SET" >&2
        else
            echo "    $name: not set (optional)" >&2
        fi
    elif [[ "$value" =~ $GUID_RE ]]; then
        echo "    $name: set (valid GUID format)" >&2
    else
        echo "    $name: set but NOT a GUID — check for quoting/copy-paste errors" >&2
    fi
}

check_guid "WIX_ACCOUNT_ID"  "${WIX_ACCOUNT_ID:-}"  required
check_guid "WIX_SITE_ID"     "${WIX_SITE_ID:-}"     optional
check_guid "WIX_METASITE_ID" "${WIX_METASITE_ID:-}" optional

if [ "${VESPASIAN_DRY_RUN:-}" = "1" ]; then
    echo "    VESPASIAN_DRY_RUN=1 — all operations run against recording transports" >&2
fi

# --- 2. API reachability ping ---
echo "" >&2
echo "  API plane:" >&2

if [ "${VESPASIAN_DRY_RUN:-}" = "1" ]; then
    echo "    skipped (dry-run mode)" >&2
elif [ -z "${WIX_API_KEY:-}" ] || [ -z "${WIX_SITE_ID:-}" ]; then
    echo "    skipped (needs WIX_API_KEY + WIX_SITE_ID)" >&2
elif ! command -v curl &> /dev/null; then
    echo "    skipped (curl not installed)" >&2
else
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        --connect-timeout 5 --max-time 10 \
        -H "Authorization: ${WIX_API_KEY}" \
        -H "wix-site-id: ${WIX_SITE_ID}" \
        "https://www.wixapis.com/site-properties/v4/properties" 2>/dev/null) || HTTP_CODE="000"

    case "$HTTP_CODE" in
        200)     echo "    reachable — site-properties returned 200 for the configured site" >&2 ;;
        401|403) echo "    AUTH FAILED (HTTP $HTTP_CODE) — key invalid, revoked, or lacks site access" >&2 ;;
        404)     echo "    HTTP 404 — WIX_SITE_ID may not exist under this account" >&2 ;;
        429)     echo "    HTTP 429 — rate limited; back off before running the pipeline" >&2 ;;
        000)     echo "    unreachable — no network or www.wixapis.com blocked" >&2 ;;
        *)       echo "    unexpected HTTP $HTTP_CODE from site-properties" >&2 ;;
    esac
fi

# --- 3. Editor session freshness ---
echo "" >&2
echo "  Editor plane (Playwright session):" >&2

SESSION_FILE="${WIX_EDITOR_STORAGE_STATE:-.vespasian/session/state.json}"

if [ -f "$SESSION_FILE" ]; then
    NOW=$(date +%s)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        MTIME=$(stat -f %m "$SESSION_FILE" 2>/dev/null || echo "$NOW")
    else
        MTIME=$(stat -c %Y "$SESSION_FILE" 2>/dev/null || echo "$NOW")
    fi
    AGE_HOURS=$(( (NOW - MTIME) / 3600 ))
    AGE_DAYS=$(( AGE_HOURS / 24 ))

    if [ "$AGE_DAYS" -ge 7 ]; then
        echo "    $SESSION_FILE: STALE (${AGE_DAYS}d old) — Wix sessions rarely survive this long." >&2
        echo "    Re-run: vespasian login --editor" >&2
    elif [ "$AGE_DAYS" -ge 2 ]; then
        echo "    $SESSION_FILE: ${AGE_DAYS}d old — may have expired; expect a re-auth pause" >&2
    else
        echo "    $SESSION_FILE: fresh (${AGE_HOURS}h old)" >&2
    fi
else
    echo "    no session at $SESSION_FILE" >&2
    echo "    Editor automation is OFF until you run: vespasian login --editor" >&2
    echo "    (one-time headed login + explicit consent; see docs/wix/editor-automation.md)" >&2
fi

echo "" >&2
echo "------------------------------" >&2
exit 0
