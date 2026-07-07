#!/bin/bash
# Project-Level Hook: Validate Output Location (PreToolUse on Write|Edit)
#
# Vespasian does not generate local WordPress theme files. The pipeline's
# artifacts are BuildPlans and state under .vespasian/, and source code lives
# in packages/. This hook blocks any Write/Edit that targets the legacy
# WordPress output directories (themes/, plugins/, mu-plugins/, wp-content/),
# which must not exist in this repository.
#
# Exit 0: Path is valid
# Exit 2: Path is invalid (blocks operation)

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# No file path = not a file operation, allow
if [ -z "$FILE_PATH" ]; then
    exit 0
fi

# Normalize to a repo-relative path (hooks run with cwd = project root)
REL_PATH="${FILE_PATH#"$PWD"/}"
REL_PATH="${REL_PATH#./}"

# Block legacy WordPress output locations at the repo root, and wp-content anywhere
if echo "$REL_PATH" | grep -qE '^(themes|plugins|mu-plugins)/' || echo "$REL_PATH" | grep -qE '(^|/)wp-content/'; then
    echo "" >&2
    echo "BLOCKED: File targets a WordPress-era output directory" >&2
    echo "   Path: $FILE_PATH" >&2
    echo "" >&2
    echo "   Vespasian's output is a live Wix site, not local theme files." >&2
    echo "   Put artifacts where they belong:" >&2
    echo "   - Compiled BuildPlans:      .vespasian/plans/<slug>/" >&2
    echo "   - Pipeline state:           .vespasian/ (checkpoints/, session/, dryrun/)" >&2
    echo "   - Source code:              packages/pipeline/, packages/wix-driver/, packages/gui/" >&2
    echo "   - Tests:                    tests/, packages/*/tests/" >&2
    echo "" >&2
    exit 2
fi

exit 0
