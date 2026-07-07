#!/usr/bin/env bats
# Tests for scripts/figma-wix/extract-design-tokens.sh
# Validates design token extraction analysis (tokens.json coverage)

load '../test_helper'

SCRIPT="${SCRIPTS_DIR}/extract-design-tokens.sh"

# Helper: run the script with a simulated hook JSON input
# The script reads stdin and writes to stderr, so redirect stderr to stdout
run_extract() {
    local file_path="$1"
    run bash -c "echo '{\"tool_input\":{\"file_path\":\"${file_path}\"}}' | bash '${SCRIPT}' 2>&1"
}

# --- Skipping non-tokens.json files ---

@test "extract-design-tokens: skips non-tokens.json files" {
    run bash -c "echo '{\"tool_input\":{\"file_path\":\"some/file.html\"}}' | bash '${SCRIPT}' 2>&1"
    assert_success
    refute_output --partial "Validating"
}

@test "extract-design-tokens: skips when file does not exist" {
    run bash -c "echo '{\"tool_input\":{\"file_path\":\"/nonexistent/tokens.json\"}}' | bash '${SCRIPT}' 2>&1"
    assert_success
    refute_output --partial "Design Token Summary"
}

# --- Valid comprehensive tokens ---

@test "extract-design-tokens: reports token counts for comprehensive token set" {
    run_extract "${FIXTURES_DIR}/complete-tokens.json"
    assert_success
    assert_output --partial "Colors: 8"
    assert_output --partial "Font Sizes: 6"
    assert_output --partial "Spacing Tokens: 7"
}

@test "extract-design-tokens: passes comprehensive design system check" {
    run_extract "${FIXTURES_DIR}/complete-tokens.json"
    assert_success
    assert_output --partial "Comprehensive design system detected"
}

# --- Minimal tokens with warnings ---

@test "extract-design-tokens: warns about insufficient colors" {
    run_extract "${FIXTURES_DIR}/minimal-tokens.json"
    assert_success
    assert_output --partial "Only 3 colors defined"
}

@test "extract-design-tokens: warns about insufficient font sizes" {
    run_extract "${FIXTURES_DIR}/minimal-tokens.json"
    assert_success
    assert_output --partial "Only 2 font sizes defined"
}

@test "extract-design-tokens: warns about insufficient spacing tokens" {
    run_extract "${FIXTURES_DIR}/minimal-tokens.json"
    assert_success
    assert_output --partial "Only 2 spacing tokens defined"
}

# --- Invalid tokens file ---

@test "extract-design-tokens: handles invalid JSON gracefully" {
    run_extract "${FIXTURES_DIR}/invalid-tokens.json"
    assert_success
    assert_output --partial "Invalid JSON syntax"
}

# --- Missing token groups ---

@test "extract-design-tokens: warns about missing token groups" {
    local tokens="${TEST_TEMP_DIR}/tokens.json"
    echo '{ "palette": [ { "slug": "primary", "color": "#123456" } ] }' > "$tokens"
    run_extract "$tokens"
    assert_success
    assert_output --partial "Missing token groups"
    assert_output --partial "spacingSizes"
}

# --- Settings-wrapped shape is accepted ---

@test "extract-design-tokens: accepts theme-settings-wrapped token shape" {
    local tokens="${TEST_TEMP_DIR}/tokens.json"
    cat > "$tokens" << 'JSON'
{
  "settings": {
    "color": { "palette": [ { "slug": "a", "color": "#111111" }, { "slug": "b", "color": "#222222" } ] },
    "typography": { "fontSizes": [ { "slug": "base", "size": "16px" } ] },
    "spacing": { "spacingSizes": [ { "slug": "40", "size": "16px" } ] }
  }
}
JSON
    run_extract "$tokens"
    assert_success
    assert_output --partial "Colors: 2"
    assert_output --partial "Font Sizes: 1"
    assert_output --partial "Spacing Tokens: 1"
}

# --- Wix translation-limit notes ---

@test "extract-design-tokens: notes text-theme slot overflow for >9 font sizes" {
    local tokens="${TEST_TEMP_DIR}/tokens.json"
    {
        echo '{ "palette": [ { "slug": "a", "color": "#111111" } ],'
        echo '  "spacingSizes": [ { "slug": "40", "size": "16px" } ],'
        echo '  "fontSizes": ['
        for i in $(seq 1 11); do
            sep=","
            [ "$i" -eq 11 ] && sep=""
            echo "    { \"slug\": \"s$i\", \"size\": \"$((11 + i))px\" }$sep"
        done
        echo ']}'
    } > "$tokens"
    run_extract "$tokens"
    assert_success
    assert_output --partial "exceed the 9-slot Wix text theme"
}

# --- Always exits 0 ---

@test "extract-design-tokens: always exits 0 even with issues" {
    run_extract "${FIXTURES_DIR}/invalid-tokens.json"
    assert_success
}
