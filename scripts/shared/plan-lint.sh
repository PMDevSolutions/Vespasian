#!/usr/bin/env bash
# plan-lint.sh — validate a Vespasian BuildPlan JSON file.
#
# The BuildPlan is the contract between the design pipeline and the Wix output
# layer (see docs/wix/ARCHITECTURE.md and packages/wix-driver/src/plan/schema.js
# for the authoritative zod schema). This is the fast, dependency-light lint
# used by hooks and CI gates; the executor re-validates with zod at apply time.
#
# Checks:
#   * file exists and parses as JSON
#   * planVersion === 1
#   * site.title is a non-empty string
#   * steps[] each carry id, op, method, phase, idempotencyKey, onFail
#   * steps[].method  in: api | cli | playwright | agent
#   * steps[].phase   in: provision | media | data | editor | code | properties | publish | qa
#   * steps[].onFail  in: retry | escalate | skip-and-report
#   * step phases appear in canonical executor order (non-decreasing)
#   * meta.sourceHash is a non-empty string
#
# Usage: plan-lint.sh <plan.json>
# Exit codes: 0 = valid, 1 = invalid, 2 = usage/tooling error

set -euo pipefail

PLAN_FILE="${1:-}"

if [[ -z "$PLAN_FILE" ]]; then
    echo "Usage: $(basename "$0") <plan.json>" >&2
    exit 2
fi

if ! command -v jq >/dev/null 2>&1; then
    echo "ERROR: jq is required (https://jqlang.github.io/jq/)" >&2
    exit 2
fi

if [[ ! -f "$PLAN_FILE" ]]; then
    echo "ERROR: plan file not found: $PLAN_FILE" >&2
    exit 1
fi

if ! jq empty "$PLAN_FILE" 2>/dev/null; then
    echo "FAIL: $PLAN_FILE is not valid JSON" >&2
    exit 1
fi

ERRORS=0
err() { echo "FAIL: $1" >&2; ERRORS=$((ERRORS + 1)); }

# planVersion
PLAN_VERSION=$(jq -r '.planVersion // empty' "$PLAN_FILE")
[[ "$PLAN_VERSION" == "1" ]] || err "planVersion must be 1 (got: ${PLAN_VERSION:-missing})"

# site.title
SITE_TITLE=$(jq -r '.site.title // empty' "$PLAN_FILE")
[[ -n "$SITE_TITLE" ]] || err "site.title is missing or empty"

# meta.sourceHash
SOURCE_HASH=$(jq -r '.meta.sourceHash // empty' "$PLAN_FILE")
[[ -n "$SOURCE_HASH" ]] || err "meta.sourceHash is missing or empty"

# steps is an array
if ! jq -e '.steps | type == "array"' "$PLAN_FILE" >/dev/null 2>&1; then
    err "steps must be an array"
else
    # Required per-step fields
    MISSING_FIELDS=$(jq -r '
        [ .steps[]
          | select((.id // "") == "" or (.op // "") == "" or (.method // "") == ""
                   or (.phase // "") == "" or (.idempotencyKey // "") == "" or (.onFail // "") == "")
          | .id // "(missing id)" ] | join(", ")' "$PLAN_FILE")
    [[ -z "$MISSING_FIELDS" ]] || err "steps missing required fields (id/op/method/phase/idempotencyKey/onFail): $MISSING_FIELDS"

    # method enum
    BAD_METHODS=$(jq -r '[ .steps[] | select(.method as $m | ["api","cli","playwright","agent"] | index($m) | not) | "\(.id // "?"):\(.method // "missing")" ] | join(", ")' "$PLAN_FILE")
    [[ -z "$BAD_METHODS" ]] || err "invalid step method (expected api|cli|playwright|agent): $BAD_METHODS"

    # phase enum
    BAD_PHASES=$(jq -r '[ .steps[] | select(.phase as $p | ["provision","media","data","editor","code","properties","publish","qa"] | index($p) | not) | "\(.id // "?"):\(.phase // "missing")" ] | join(", ")' "$PLAN_FILE")
    [[ -z "$BAD_PHASES" ]] || err "invalid step phase (expected provision|media|data|editor|code|properties|publish|qa): $BAD_PHASES"

    # onFail enum
    BAD_ONFAIL=$(jq -r '[ .steps[] | select(.onFail as $f | ["retry","escalate","skip-and-report"] | index($f) | not) | "\(.id // "?"):\(.onFail // "missing")" ] | join(", ")' "$PLAN_FILE")
    [[ -z "$BAD_ONFAIL" ]] || err "invalid step onFail (expected retry|escalate|skip-and-report): $BAD_ONFAIL"

    # canonical phase ordering: the sequence of phase indexes must be non-decreasing
    ORDERED=$(jq -r '
        ["provision","media","data","editor","code","properties","publish","qa"] as $phases
        | [ .steps[].phase as $p | ($phases | index($p)) // -1 ]
        | . as $idx
        | ( [range(1; length)] | map($idx[.] >= $idx[. - 1]) | all )' "$PLAN_FILE")
    [[ "$ORDERED" == "true" ]] || err "step phases are out of canonical executor order (provision → media → data → editor → code → properties → publish → qa)"
fi

STEP_COUNT=$(jq -r '.steps | length' "$PLAN_FILE" 2>/dev/null || echo 0)

if [[ $ERRORS -gt 0 ]]; then
    echo "" >&2
    echo "plan-lint: $ERRORS error(s) in $PLAN_FILE" >&2
    exit 1
fi

echo "plan-lint: OK — $PLAN_FILE ($STEP_COUNT steps, planVersion $PLAN_VERSION)"
exit 0
