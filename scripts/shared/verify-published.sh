#!/usr/bin/env bash
# verify-published.sh — smoke-check a published Wix site over plain HTTP.
#
# The cheapest post-publish gate: the page must be reachable, return 200, and
# not be a Wix "not found"/parked placeholder. Deeper checks (pixel diffs,
# computed-style assertions) live in the QA layer (packages/wix-driver/src/qa
# and the visual-qa agent) — this script is for hooks, CI, and pre/post-publish
# sanity.
#
# Usage:
#   verify-published.sh [url] [--path /about] [--expect "text"] [--timeout 15]
#
#   url        Base URL of the published site. Defaults to $WIX_SITE_URL.
#   --path     Path to append to the base URL (repeatable).
#   --expect   Substring that must appear in the response body (repeatable).
#   --timeout  Per-request timeout in seconds (default 15).
#
# Exit codes: 0 = all checks passed, 1 = a check failed, 2 = usage error

set -euo pipefail

URL="${WIX_SITE_URL:-}"
PATHS=()
EXPECTS=()
TIMEOUT=15

while [[ $# -gt 0 ]]; do
    case "$1" in
        --path)    PATHS+=("$2"); shift 2 ;;
        --expect)  EXPECTS+=("$2"); shift 2 ;;
        --timeout) TIMEOUT="$2"; shift 2 ;;
        -h|--help)
            sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
            exit 0 ;;
        -*)
            echo "Unknown option: $1" >&2
            exit 2 ;;
        *)
            URL="$1"; shift ;;
    esac
done

if [[ -z "$URL" ]]; then
    echo "ERROR: no site URL." >&2
    echo "Pass the published site URL as the first argument or set WIX_SITE_URL" >&2
    echo "(e.g. WIX_SITE_URL=https://mysite.wixsite.com/home or a connected domain)." >&2
    exit 2
fi

if ! command -v curl >/dev/null 2>&1; then
    echo "ERROR: curl is required" >&2
    exit 2
fi

URL="${URL%/}"
[[ ${#PATHS[@]} -eq 0 ]] && PATHS=("/")

FAILURES=0

for p in "${PATHS[@]}"; do
    target="$URL$p"
    body_file="$(mktemp)"
    http_code=$(curl -sS -L -o "$body_file" -w "%{http_code}" \
        --connect-timeout 5 --max-time "$TIMEOUT" "$target" 2>/dev/null) || http_code="000"

    if [[ "$http_code" != "200" ]]; then
        echo "FAIL: $target returned HTTP $http_code (expected 200)" >&2
        FAILURES=$((FAILURES + 1))
        rm -f "$body_file"
        continue
    fi

    if [[ ! -s "$body_file" ]]; then
        echo "FAIL: $target returned an empty body" >&2
        FAILURES=$((FAILURES + 1))
        rm -f "$body_file"
        continue
    fi

    # Wix serves its own error/parked pages with HTTP 200 in some flows —
    # catch the obvious placeholder markers.
    if grep -qiE "this site (is not|isn't) available|<title>[^<]*Page Not Found" "$body_file"; then
        echo "FAIL: $target looks like a Wix placeholder / not-found page" >&2
        FAILURES=$((FAILURES + 1))
        rm -f "$body_file"
        continue
    fi

    ok=true
    for needle in ${EXPECTS[@]+"${EXPECTS[@]}"}; do
        if ! grep -qF "$needle" "$body_file"; then
            echo "FAIL: $target does not contain expected text: $needle" >&2
            FAILURES=$((FAILURES + 1))
            ok=false
        fi
    done

    $ok && echo "OK:   $target (HTTP 200, $(wc -c < "$body_file" | tr -d ' ') bytes)"
    rm -f "$body_file"
done

if [[ $FAILURES -gt 0 ]]; then
    echo "" >&2
    echo "verify-published: $FAILURES check(s) failed" >&2
    exit 1
fi

echo "verify-published: all checks passed"
exit 0
