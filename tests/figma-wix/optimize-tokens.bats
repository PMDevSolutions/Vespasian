#!/usr/bin/env bats
# Tests for scripts/figma-wix/optimize-tokens.sh
# Analyzes generated output for hardcoded values and suggests token promotions

load '../test_helper'

SCRIPT="${SCRIPTS_DIR}/optimize-tokens.sh"

# Build a clean staged-output dir (token-referencing CSS only)
make_clean_output() {
    local dir="$1"
    mkdir -p "$dir/src/styles"
    cat > "$dir/src/styles/global.css" << 'CSS'
:root {
  --vsp-space-40: 16px;
  --vsp-color-primary: #1a3f6f;
}
CSS
    cat > "$dir/page.css" << 'CSS'
.hero { padding: var(--vsp-space-40); color: var(--vsp-color-primary); }
CSS
}

# Build a dirty staged-output dir (many hardcoded values)
make_dirty_output() {
    local dir="$1"
    mkdir -p "$dir"
    cat > "$dir/page.css" << 'CSS'
.a { color: #ff0000; font-size: 48px; padding: 32px; }
.b { color: #ff0000; font-size: 48px; margin: 32px; }
.c { color: #00ff00; font-size: 16px; gap: 32px; }
.d { color: #00ff00; font-size: 16px; padding: 16px; }
.e { color: #0000ff; font-size: 14px; margin: 16px; }
CSS
}

# --- Missing output directory ---

@test "optimize-tokens: fails when output directory missing" {
    run bash "$SCRIPT" "/nonexistent/output"
    assert_failure
    assert_output --partial "No output directory found"
}

# --- Clean output ---

@test "optimize-tokens: reports zero hardcoded values for clean output" {
    make_clean_output "${TEST_TEMP_DIR}/clean"
    run bash "$SCRIPT" "${TEST_TEMP_DIR}/clean"
    assert_success
    assert_output --partial "Total hardcoded values found: 0"
    assert_output --partial "EXCELLENT"
}

@test "optimize-tokens: excludes global.css token definitions from the scan" {
    make_clean_output "${TEST_TEMP_DIR}/clean"
    # global.css contains #1a3f6f but must not be counted
    run bash "$SCRIPT" "${TEST_TEMP_DIR}/clean"
    assert_success
    refute_output --partial "#1a3f6f used"
}

@test "optimize-tokens: shows all analysis sections" {
    make_clean_output "${TEST_TEMP_DIR}/clean"
    run bash "$SCRIPT" "${TEST_TEMP_DIR}/clean"
    assert_success
    assert_output --partial "Spacing Analysis"
    assert_output --partial "Font Size Analysis"
    assert_output --partial "Color Analysis"
}

# --- Dirty output ---

@test "optimize-tokens: detects hardcoded colors" {
    make_dirty_output "${TEST_TEMP_DIR}/dirty"
    run bash "$SCRIPT" "${TEST_TEMP_DIR}/dirty"
    assert_success
    assert_output --partial "#ff0000"
    assert_output --partial "SHOULD BE A PALETTE TOKEN"
}

@test "optimize-tokens: suggests spacing token slugs" {
    make_dirty_output "${TEST_TEMP_DIR}/dirty"
    run bash "$SCRIPT" "${TEST_TEMP_DIR}/dirty"
    assert_success
    assert_output --partial "--vsp-space-"
}

@test "optimize-tokens: reports NEEDS WORK for many hardcoded values" {
    make_dirty_output "${TEST_TEMP_DIR}/dirty"
    run bash "$SCRIPT" "${TEST_TEMP_DIR}/dirty"
    assert_success
    assert_output --partial "NEEDS WORK"
}

# --- Token coverage ---

@test "optimize-tokens: reports token coverage from a tokens file" {
    make_clean_output "${TEST_TEMP_DIR}/clean"
    run bash "$SCRIPT" "${TEST_TEMP_DIR}/clean" "${FIXTURES_DIR}/complete-tokens.json"
    assert_success
    assert_output --partial "Current Token Coverage"
    assert_output --partial "Colors: 8 tokens"
    assert_output --partial "Good token coverage"
}

@test "optimize-tokens: warns about missing tokens file" {
    make_clean_output "${TEST_TEMP_DIR}/clean"
    run bash "$SCRIPT" "${TEST_TEMP_DIR}/clean" "${TEST_TEMP_DIR}/does-not-exist.json"
    assert_success
    assert_output --partial "Tokens File Not Found"
}

@test "optimize-tokens: flags limited token coverage" {
    make_clean_output "${TEST_TEMP_DIR}/clean"
    run bash "$SCRIPT" "${TEST_TEMP_DIR}/clean" "${FIXTURES_DIR}/minimal-tokens.json"
    assert_success
    assert_output --partial "Limited token coverage"
}

# --- Summary section ---

@test "optimize-tokens: includes summary section" {
    make_clean_output "${TEST_TEMP_DIR}/clean"
    run bash "$SCRIPT" "${TEST_TEMP_DIR}/clean"
    assert_success
    assert_output --partial "Summary"
    assert_output --partial "Spacing:"
    assert_output --partial "Font sizes:"
    assert_output --partial "Colors:"
}
