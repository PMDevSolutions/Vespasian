#!/bin/bash
# Content Seeder Verification - Stop hook
# Verifies the pages the pipeline expects actually exist on the target site.
# Exit 0 (informational only).
#
# Expected pages come from the content model (.vespasian/content.json) or,
# failing that, from pages.create steps in the newest BuildPlan. Wix has no
# public API that lists a site's page structure (pages are editor-plane), so
# live verification happens over HTTP against the PUBLISHED site when
# WIX_SITE_URL is set; otherwise this prints the expectation list and skips.

echo "" >&2
echo "Content Seeder Verification" >&2
echo "------------------------------" >&2

EXPECTED_PAGES=()

# --- Source 1: content model ---
CONTENT_FILE=".vespasian/content.json"
if [ -f "$CONTENT_FILE" ] && command -v jq &> /dev/null; then
    while IFS= read -r title; do
        [ -n "$title" ] && EXPECTED_PAGES+=("$title")
    done < <(jq -r '.pages[]? | (.title // .name // empty)' "$CONTENT_FILE" 2>/dev/null)
    if [ ${#EXPECTED_PAGES[@]} -gt 0 ]; then
        echo "  Expected pages (from $CONTENT_FILE):" >&2
    fi
fi

# --- Source 2: newest BuildPlan ---
if [ ${#EXPECTED_PAGES[@]} -eq 0 ] && command -v jq &> /dev/null; then
    PLAN_FILE=$(ls -t .vespasian/plans/*.json 2>/dev/null | head -1)
    if [ -n "$PLAN_FILE" ]; then
        while IFS= read -r title; do
            [ -n "$title" ] && EXPECTED_PAGES+=("$title")
        done < <(jq -r '.steps[]? | select(.op | test("page")) | (.input.title // .input.name // empty)' "$PLAN_FILE" 2>/dev/null)
        if [ ${#EXPECTED_PAGES[@]} -gt 0 ]; then
            echo "  Expected pages (from $PLAN_FILE):" >&2
        fi
    fi
fi

if [ ${#EXPECTED_PAGES[@]} -eq 0 ]; then
    echo "  No page manifest found (.vespasian/content.json or a BuildPlan)" >&2
    echo "  Nothing to verify." >&2
    echo "------------------------------" >&2
    exit 0
fi

for page in "${EXPECTED_PAGES[@]}"; do
    echo "    - $page" >&2
done

# --- Live verification over HTTP (published site) ---
if [ -n "${WIX_SITE_URL:-}" ] && command -v curl &> /dev/null; then
    echo "" >&2
    echo "  Published site status ($WIX_SITE_URL):" >&2

    slugify() {
        echo "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g'
    }

    BASE="${WIX_SITE_URL%/}"
    for page in "${EXPECTED_PAGES[@]}"; do
        slug=$(slugify "$page")
        # Home page conventions: the base URL itself
        if [ "$slug" = "home" ] || [ "$slug" = "front-page" ] || [ "$slug" = "index" ]; then
            target="$BASE/"
        else
            target="$BASE/$slug"
        fi
        code=$(curl -s -o /dev/null -w "%{http_code}" -L --connect-timeout 5 --max-time 15 "$target" 2>/dev/null) || code="000"
        case "$code" in
            200) echo "    OK   $page ($target)" >&2 ;;
            404) echo "    MISS $page ($target returned 404 — page not published or slug differs)" >&2 ;;
            000) echo "    ???  $page ($target unreachable)" >&2 ;;
            *)   echo "    WARN $page ($target returned HTTP $code)" >&2 ;;
        esac
    done
else
    echo "" >&2
    echo "  WIX_SITE_URL not set — skipping live verification" >&2
    echo "  Note: Wix has no page-listing API; pages are verified against the" >&2
    echo "  published site. Set WIX_SITE_URL after the first publish, or use" >&2
    echo "  the wix-site-builder agent to confirm pages inside the editor." >&2
fi

echo "" >&2
echo "------------------------------" >&2
exit 0
