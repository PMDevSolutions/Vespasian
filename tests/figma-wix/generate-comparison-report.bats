#!/usr/bin/env bats
# Tests for scripts/figma-wix/generate-comparison-report.sh
# Validates report generation for Figma-to-Wix conversion

load '../test_helper'

SCRIPT="${SCRIPTS_DIR}/generate-comparison-report.sh"

setup() {
    TEST_TEMP_DIR="$(mktemp -d)"
    export ORIGINAL_DIR="$(pwd)"
}

teardown() {
    cd "$ORIGINAL_DIR"
    if [[ -d "$TEST_TEMP_DIR" ]]; then
        rm -rf "$TEST_TEMP_DIR"
    fi
}

# Stage a representative .vespasian state (tokens + plan) in the cwd
stage_artifacts() {
    mkdir -p .vespasian/plans
    cp "${FIXTURES_DIR}/complete-tokens.json" .vespasian/tokens.json
    cp "${FIXTURES_DIR}/plans/valid-plan.json" .vespasian/plans/fixture.json
}

# --- Report generation ---

@test "generate-comparison-report: creates report file" {
    cd "$TEST_TEMP_DIR"
    stage_artifacts

    run bash "$SCRIPT" 2>&1
    assert_success
    assert [ -f ".claude/reports/figma-wix-comparison.md" ]
}

@test "generate-comparison-report: includes report title" {
    cd "$TEST_TEMP_DIR"
    stage_artifacts

    bash "$SCRIPT" 2>/dev/null
    run cat ".claude/reports/figma-wix-comparison.md"
    assert_output --partial "Figma-to-Wix Conversion Report"
}

@test "generate-comparison-report: includes timestamp" {
    cd "$TEST_TEMP_DIR"
    stage_artifacts

    bash "$SCRIPT" 2>/dev/null
    run cat ".claude/reports/figma-wix-comparison.md"
    assert_output --partial "Generated:"
    assert_output --regexp '[0-9]{4}-[0-9]{2}-[0-9]{2}'
}

# --- Token counts in report ---

@test "generate-comparison-report: reports design token counts" {
    cd "$TEST_TEMP_DIR"
    stage_artifacts

    bash "$SCRIPT" 2>/dev/null
    run cat ".claude/reports/figma-wix-comparison.md"
    assert_output --partial "Colors: 8"
}

# --- BuildPlan summary ---

@test "generate-comparison-report: summarizes the BuildPlan" {
    cd "$TEST_TEMP_DIR"
    stage_artifacts

    bash "$SCRIPT" 2>/dev/null
    run cat ".claude/reports/figma-wix-comparison.md"
    assert_output --partial "BuildPlan"
    assert_output --partial "Total steps:"
    assert_output --partial "provision"
}

@test "generate-comparison-report: includes fidelity notes from the plan" {
    cd "$TEST_TEMP_DIR"
    stage_artifacts

    bash "$SCRIPT" 2>/dev/null
    run cat ".claude/reports/figma-wix-comparison.md"
    assert_output --partial "Fidelity notes"
    assert_output --partial "spacing-css-only"
}

# --- Missing artifacts ---

@test "generate-comparison-report: warns when no tokens.json exists" {
    cd "$TEST_TEMP_DIR"
    run bash "$SCRIPT" 2>&1
    assert_success
    run cat ".claude/reports/figma-wix-comparison.md"
    assert_output --partial "no tokens.json found"
}

@test "generate-comparison-report: warns when no BuildPlan exists" {
    cd "$TEST_TEMP_DIR"
    run bash "$SCRIPT" 2>&1
    assert_success
    run cat ".claude/reports/figma-wix-comparison.md"
    assert_output --partial "no BuildPlan found"
}

# --- Always exits 0 ---

@test "generate-comparison-report: always exits 0" {
    cd "$TEST_TEMP_DIR"
    run bash "$SCRIPT" 2>&1
    assert_success
}
