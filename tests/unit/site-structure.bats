#!/usr/bin/env bats
# Validates the BuildPlan JSON shape — the contract between the design
# pipeline and the Wix output layer. A malformed plan silently breaks the
# executor at apply time; these tests catch the regression at CI time using
# scripts/shared/plan-lint.sh plus committed known-good/known-bad fixtures.
#
# A valid BuildPlan (packages/wix-driver/src/plan/schema.js):
#   * planVersion === 1
#   * site.title non-empty
#   * steps[] with id/op/method/phase/idempotencyKey/onFail
#   * method  in api|cli|playwright|agent
#   * phase   in provision|media|data|editor|code|properties|publish|qa (in order)
#   * meta.sourceHash non-empty

load '../test_helper'

PLAN_LINT="${PROJECT_ROOT}/scripts/shared/plan-lint.sh"
PLANS_DIR="${PROJECT_ROOT}/.vespasian/plans"

# --- Fixture-based regression tests (always run) ---

@test "fixture: valid-plan passes plan-lint" {
    run bash "$PLAN_LINT" "${FIXTURES_DIR}/plans/valid-plan.json"
    assert_success
    assert_output --partial "plan-lint: OK"
}

@test "fixture: invalid method fails plan-lint" {
    run bash "$PLAN_LINT" "${FIXTURES_DIR}/plans/invalid-plan-bad-method.json"
    assert_failure
    assert_output --partial "invalid step method"
}

@test "fixture: out-of-order phases fail plan-lint" {
    run bash "$PLAN_LINT" "${FIXTURES_DIR}/plans/invalid-plan-out-of-order.json"
    assert_failure
    assert_output --partial "out of canonical executor order"
}

@test "plan-lint rejects non-JSON input" {
    local bad="${TEST_TEMP_DIR}/broken.json"
    echo '{ not json' > "$bad"
    run bash "$PLAN_LINT" "$bad"
    assert_failure
    assert_output --partial "not valid JSON"
}

@test "plan-lint rejects a plan without planVersion" {
    local bad="${TEST_TEMP_DIR}/no-version.json"
    cat > "$bad" << 'JSON'
{ "site": { "title": "X" }, "steps": [], "fidelity": [], "meta": { "sourceHash": "h" } }
JSON
    run bash "$PLAN_LINT" "$bad"
    assert_failure
    assert_output --partial "planVersion"
}

@test "plan-lint rejects a plan without site.title" {
    local bad="${TEST_TEMP_DIR}/no-title.json"
    cat > "$bad" << 'JSON'
{ "planVersion": 1, "site": {}, "steps": [], "fidelity": [], "meta": { "sourceHash": "h" } }
JSON
    run bash "$PLAN_LINT" "$bad"
    assert_failure
    assert_output --partial "site.title"
}

@test "plan-lint rejects steps missing required fields" {
    local bad="${TEST_TEMP_DIR}/missing-fields.json"
    cat > "$bad" << 'JSON'
{
  "planVersion": 1,
  "site": { "title": "X" },
  "steps": [ { "id": "s1", "op": "site.create", "method": "api", "phase": "provision" } ],
  "fidelity": [],
  "meta": { "sourceHash": "h" }
}
JSON
    run bash "$PLAN_LINT" "$bad"
    assert_failure
    assert_output --partial "missing required fields"
}

@test "plan-lint rejects invalid onFail values" {
    local bad="${TEST_TEMP_DIR}/bad-onfail.json"
    cat > "$bad" << 'JSON'
{
  "planVersion": 1,
  "site": { "title": "X" },
  "steps": [ { "id": "s1", "op": "site.create", "method": "api", "phase": "provision", "input": {}, "idempotencyKey": "k", "onFail": "explode" } ],
  "fidelity": [],
  "meta": { "sourceHash": "h" }
}
JSON
    run bash "$PLAN_LINT" "$bad"
    assert_failure
    assert_output --partial "invalid step onFail"
}

# --- Local compiled plans (loop over .vespasian/plans/ when present) ---

@test "every compiled plan under .vespasian/plans/ passes plan-lint" {
    local plans
    # Default pipeline layout is .vespasian/plans/<slug>/plan.json; a --plan
    # override can also land a bare .json directly under plans/.
    plans=$(ls "$PLANS_DIR"/*/plan.json "$PLANS_DIR"/*.json 2>/dev/null || true)
    if [[ -z "$plans" ]]; then
        skip "no compiled plans present in .vespasian/plans/"
    fi

    local invalid=()
    local plan
    while IFS= read -r plan; do
        if ! bash "$PLAN_LINT" "$plan" >/dev/null 2>&1; then
            invalid+=("$(basename "$plan")")
        fi
    done <<< "$plans"

    if [[ ${#invalid[@]} -gt 0 ]]; then
        echo "Plans failing lint: ${invalid[*]}"
        return 1
    fi
}
