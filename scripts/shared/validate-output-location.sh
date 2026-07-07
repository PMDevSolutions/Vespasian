#!/bin/bash
#
# validate-output-location.sh (shared)
# PreToolUse hook: blocks writes to WordPress-style output locations.
#
# Vespasian produces a live Wix site, not local theme files. Generated
# artifacts belong in:
#   .vespasian/   — build plans, checkpoints, dry-run staging, editor session
#   packages/     — framework source (pipeline, wix-driver, gui)
#
# There is no themes/, plugins/, mu-plugins/, or wp-content/ in this project.
# Attempts to write there are almost always muscle memory from the WordPress
# fork ancestor (Flavian) and are blocked before the tool runs.
#
# Input: CLAUDE_TOOL_INPUT env var (JSON with file_path), or the same JSON on
#        stdin when the env var is unset.
# Exit codes:
#   0 - Path is fine (or no file operation detected)
#   2 - Path is a WordPress-style location — operation BLOCKED
#

set -e

# Parse tool input: env var first, stdin fallback.
TOOL_INPUT="${CLAUDE_TOOL_INPUT:-}"
if [ -z "$TOOL_INPUT" ] && [ ! -t 0 ]; then
    TOOL_INPUT="$(cat || true)"
fi

if [ -z "$TOOL_INPUT" ]; then
    # No tool input provided — allow (not a file operation)
    exit 0
fi

extract_key() {
    # Portable JSON string extraction (no grep -P): jq when present, sed fallback.
    local key="$1"
    if command -v jq >/dev/null 2>&1; then
        echo "$TOOL_INPUT" | jq -r ".${key} // (.tool_input.${key} // empty)" 2>/dev/null || true
    else
        echo "$TOOL_INPUT" | sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -1
    fi
}

FILE_PATH="$(extract_key file_path)"
[ -z "$FILE_PATH" ] && FILE_PATH="$(extract_key path)"

if [ -z "$FILE_PATH" ]; then
    # No file path found — allow (not a file write/edit)
    exit 0
fi

# Normalize to a project-relative-ish path for matching.
REL_PATH="$FILE_PATH"
if [[ "$REL_PATH" == /* ]]; then
    PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
    REL_PATH="${REL_PATH#$PROJECT_ROOT/}"
fi

if [[ "$REL_PATH" =~ (^|/)(wp-content|themes|plugins|mu-plugins)/ ]]; then
    echo "ERROR: WordPress-style output location detected" >&2
    echo "" >&2
    echo "File path: $FILE_PATH" >&2
    echo "" >&2
    echo "Vespasian does not generate local WordPress theme/plugin files." >&2
    echo "The output of a Vespasian run is a LIVE WIX SITE, applied via a" >&2
    echo "BuildPlan. Local artifacts belong under:" >&2
    echo "" >&2
    echo "  .vespasian/plans/         — compiled BuildPlans" >&2
    echo "  .vespasian/checkpoints/   — apply checkpoints (--resume-from)" >&2
    echo "  .vespasian/dryrun/        — dry-run staging (global.css, Velo files)" >&2
    echo "  packages/                 — framework source code" >&2
    echo "" >&2
    echo "See docs/wix/ARCHITECTURE.md and CLAUDE.md for the output model." >&2
    exit 2
fi

# Path is valid — allow operation
exit 0
