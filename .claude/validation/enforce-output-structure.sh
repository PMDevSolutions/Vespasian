#!/bin/bash
#
# enforce-output-structure.sh
# Validates Vespasian's output/repository layout:
#   - NO WordPress-era output directories (themes/, plugins/, mu-plugins/, wp-content/)
#   - pipeline state lives under .vespasian/ (gitignored)
#   - the pnpm workspace package layout is intact
#
# Usage: ./enforce-output-structure.sh
# Exit codes:
#   0 - Structure valid
#   1 - Structure invalid
#

set -e

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$PROJECT_ROOT"

echo "=== Vespasian Output Structure Validation ==="
echo "Project root: $PROJECT_ROOT"
echo ""

ERRORS=0

# 1. WordPress-era directories must NOT exist — Vespasian's output is a live
#    Wix site driven by BuildPlans, not local theme/plugin files.
echo "Checking for forbidden WordPress-era directories..."
for dir in themes plugins mu-plugins wp-content; do
    if [ -d "$dir" ]; then
        echo "ERROR: $dir/ exists at project root"
        echo "   Vespasian does not generate local WordPress output."
        echo "   BuildPlans belong in .vespasian/plans/; code in packages/."
        ERRORS=$((ERRORS + 1))
    else
        echo "  ok: no $dir/ directory"
    fi
done
echo ""

# 2. Workspace package layout must be intact.
echo "Checking workspace package layout..."
for path in packages/pipeline packages/wix-driver packages/gui bin/vespasian.mjs pnpm-workspace.yaml; do
    if [ -e "$path" ]; then
        echo "  ok: $path"
    else
        echo "ERROR: $path missing — workspace layout is broken"
        ERRORS=$((ERRORS + 1))
    fi
done
echo ""

# 3. Pipeline state (when present) must live under .vespasian/ and stay
#    out of version control.
echo "Checking pipeline state directory..."
if [ -d ".vespasian" ]; then
    echo "  ok: .vespasian/ exists (plans/, checkpoints/, session/, dryrun/)"
    if [ -f ".gitignore" ] && grep -qE '^/?\.vespasian' .gitignore; then
        echo "  ok: .vespasian/ is gitignored"
    else
        echo "ERROR: .vespasian/ is not listed in .gitignore — session state and"
        echo "   checkpoints must never be committed"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo "  ok: no .vespasian/ yet (created on first plan/apply/login)"
fi
echo ""

# Summary
if [ $ERRORS -eq 0 ]; then
    echo "SUCCESS: output structure is valid"
    echo ""
    echo "Where things go:"
    echo "  - Compiled BuildPlans:  .vespasian/plans/<slug>/"
    echo "  - Checkpoints:          .vespasian/checkpoints/"
    echo "  - Editor session:       .vespasian/session/state.json (never commit)"
    echo "  - Source code:          packages/pipeline, packages/wix-driver, packages/gui"
    echo ""
    exit 0
else
    echo "FAILED: output structure has $ERRORS error(s)"
    echo ""
    echo "Fix required:"
    echo "  1. Remove any themes/, plugins/, mu-plugins/, wp-content/ directories"
    echo "  2. Restore missing workspace packages (git checkout packages/)"
    echo "  3. Ensure .vespasian/ is present in .gitignore"
    echo ""
    exit 1
fi
