#!/usr/bin/env bash
# optimize-images.sh — losslessly/leanly optimize images before uploading them
# to the Wix Media Manager (BuildPlan media phase).
#
# Smaller uploads mean faster media-phase runs, faster file-ready polling, and
# lighter published pages. Uses whichever optimizers are installed and skips
# the rest with a note:
#   cwebp     (webp companions for jpg/png)   brew install webp / apt install webp
#   jpegoptim (jpeg, strip metadata, q85)     brew/apt install jpegoptim
#   optipng   (png, -o2)                      brew/apt install optipng
#   svgo      (svg)                           npm i -g svgo
#
# Usage:
#   optimize-images.sh <assets-dir> [--webp] [--dry-run]
#
#   assets-dir  directory of staged assets (e.g. the pipeline's asset-staging
#               output referenced by assets.manifest.json)
#   --webp      also emit .webp companions next to jpg/png sources
#   --dry-run   report what would be done without touching files
#
# Exit codes: 0 = done (even if some optimizers are missing), 2 = usage error

set -euo pipefail

ASSETS_DIR=""
MAKE_WEBP=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --webp)    MAKE_WEBP=true; shift ;;
        --dry-run) DRY_RUN=true; shift ;;
        -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        -*)        echo "Unknown option: $1" >&2; exit 2 ;;
        *)         ASSETS_DIR="$1"; shift ;;
    esac
done

if [[ -z "$ASSETS_DIR" || ! -d "$ASSETS_DIR" ]]; then
    echo "Usage: $(basename "$0") <assets-dir> [--webp] [--dry-run]" >&2
    exit 2
fi

have() { command -v "$1" >/dev/null 2>&1; }

size_of() {
    if [[ "$OSTYPE" == darwin* ]]; then stat -f %z "$1"; else stat -c %s "$1"; fi
}

TOTAL_BEFORE=0
TOTAL_AFTER=0
COUNT=0

echo "=== Image optimization: $ASSETS_DIR ==="
have jpegoptim || echo "  (jpegoptim not installed — jpeg pass skipped)"
have optipng   || echo "  (optipng not installed — png pass skipped)"
have svgo      || echo "  (svgo not installed — svg pass skipped)"
$MAKE_WEBP && { have cwebp || echo "  (cwebp not installed — webp companions skipped)"; }
echo ""

while IFS= read -r img; do
    ext="${img##*.}"
    ext="$(echo "$ext" | tr '[:upper:]' '[:lower:]')"
    before=$(size_of "$img")
    TOTAL_BEFORE=$((TOTAL_BEFORE + before))
    COUNT=$((COUNT + 1))

    if $DRY_RUN; then
        echo "  [dry-run] would optimize: $img ($before bytes)"
        TOTAL_AFTER=$((TOTAL_AFTER + before))
        continue
    fi

    case "$ext" in
        jpg|jpeg)
            have jpegoptim && jpegoptim --strip-all --max=85 --quiet "$img" || true
            ;;
        png)
            have optipng && optipng -quiet -o2 "$img" || true
            ;;
        svg)
            have svgo && svgo --quiet "$img" || true
            ;;
    esac

    if $MAKE_WEBP && have cwebp; then
        case "$ext" in
            jpg|jpeg|png)
                cwebp -quiet -q 82 "$img" -o "${img%.*}.webp" || true
                ;;
        esac
    fi

    after=$(size_of "$img")
    TOTAL_AFTER=$((TOTAL_AFTER + after))
    if [[ "$after" -lt "$before" ]]; then
        echo "  optimized: $img ($before -> $after bytes)"
    else
        echo "  unchanged: $img ($before bytes)"
    fi
done < <(find "$ASSETS_DIR" -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.svg' \) 2>/dev/null)

echo ""
if [[ $COUNT -eq 0 ]]; then
    echo "No images found under $ASSETS_DIR"
else
    SAVED=$((TOTAL_BEFORE - TOTAL_AFTER))
    echo "=== $COUNT image(s): $TOTAL_BEFORE -> $TOTAL_AFTER bytes (saved $SAVED) ==="
    echo "Next: stage assets (pnpm pipeline:stage-assets) and let the media phase upload them."
fi

exit 0
