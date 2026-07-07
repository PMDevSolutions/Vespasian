#!/usr/bin/env bats
# Tests for scripts/figma-wix/batch-convert-templates.sh
# Validates the multi-page conversion process and progress tracking

load '../test_helper'

SCRIPT="${SCRIPTS_DIR}/batch-convert-templates.sh"

# Helper: run with CLI args
run_batch() {
    run bash -c "echo '' | bash '${SCRIPT}' '$1' '$2' '$3' 2>&1"
}

# Build a work dir with valid page payloads
make_pages() {
    local dir="$1"
    mkdir -p "$dir"
    cat > "$dir/home.json" << 'JSON'
{ "title": "Home", "sections": [ { "name": "hero", "blocks": [ { "type": "heading", "text": "Hi" } ] } ] }
JSON
    cat > "$dir/about.json" << 'JSON'
{ "title": "About", "sections": [ { "name": "intro", "blocks": [ { "type": "paragraph", "text": "About us" } ] } ] }
JSON
}

# --- Missing work directory ---

@test "batch-convert: reports error for missing work directory" {
    run bash -c "echo '' | bash '${SCRIPT}' '/nonexistent/pages' 2>&1"
    assert_success  # exits 0 even on error
    assert_output --partial "Work directory not found"
}

@test "batch-convert: reports error when no directory specified" {
    run bash -c "echo '' | bash '${SCRIPT}' 2>&1"
    assert_success
    assert_output --partial "No work directory specified"
}

# --- Valid work directory ---

@test "batch-convert: validates page payloads in a valid work dir" {
    make_pages "${TEST_TEMP_DIR}/pages"
    run_batch "${TEST_TEMP_DIR}/pages" "2" "0"
    assert_success
    assert_output --partial "Batch Conversion Validation"
}

@test "batch-convert: counts page payload files" {
    make_pages "${TEST_TEMP_DIR}/pages"
    run_batch "${TEST_TEMP_DIR}/pages" "2" "0"
    assert_success
    assert_output --partial "Page payloads found: 2"
}

@test "batch-convert: shows progress statistics" {
    make_pages "${TEST_TEMP_DIR}/pages"
    run_batch "${TEST_TEMP_DIR}/pages" "4" "2"
    assert_success
    assert_output --partial "Progress Statistics"
    assert_output --partial "Total pages expected: 4"
    assert_output --partial "Pages completed: 2"
}

@test "batch-convert: shows progress percentage" {
    make_pages "${TEST_TEMP_DIR}/pages"
    run_batch "${TEST_TEMP_DIR}/pages" "4" "2"
    assert_success
    assert_output --partial "Progress: 50%"
}

# --- Checkpoint recommendations ---

@test "batch-convert: recommends checkpoint every 3 pages" {
    make_pages "${TEST_TEMP_DIR}/pages"
    run_batch "${TEST_TEMP_DIR}/pages" "6" "3"
    assert_success
    assert_output --partial "Checkpoint recommended"
}

@test "batch-convert: does not recommend checkpoint at non-interval" {
    make_pages "${TEST_TEMP_DIR}/pages"
    run_batch "${TEST_TEMP_DIR}/pages" "6" "2"
    assert_success
    refute_output --partial "Checkpoint recommended"
}

# --- Page payload validation ---

@test "batch-convert: marks valid payloads as valid" {
    make_pages "${TEST_TEMP_DIR}/pages"
    run_batch "${TEST_TEMP_DIR}/pages" "2" "0"
    assert_success
    assert_output --partial "home.json: valid"
}

@test "batch-convert: flags invalid JSON payloads" {
    make_pages "${TEST_TEMP_DIR}/pages"
    echo '{ broken json' > "${TEST_TEMP_DIR}/pages/broken.json"
    run_batch "${TEST_TEMP_DIR}/pages" "3" "0"
    assert_success
    assert_output --partial "broken.json: invalid JSON"
}

@test "batch-convert: detects hardcoded colors in page payloads" {
    make_pages "${TEST_TEMP_DIR}/pages"
    cat > "${TEST_TEMP_DIR}/pages/loud.json" << 'JSON'
{ "title": "Loud", "sections": [ { "blocks": [ { "type": "heading", "style": { "color": "#ff0000" } } ] } ] }
JSON
    run_batch "${TEST_TEMP_DIR}/pages" "3" "0"
    assert_success
    assert_output --partial "hardcoded color"
}

# --- tokens.json detection ---

@test "batch-convert: detects tokens.json alongside the batch" {
    make_pages "${TEST_TEMP_DIR}/pages"
    cp "${FIXTURES_DIR}/complete-tokens.json" "${TEST_TEMP_DIR}/pages/tokens.json"
    run_batch "${TEST_TEMP_DIR}/pages" "2" "0"
    assert_success
    assert_output --partial "tokens.json found"
    assert_output --partial "Colors: 8"
}

@test "batch-convert: reports missing tokens.json" {
    make_pages "${TEST_TEMP_DIR}/pages"
    run_batch "${TEST_TEMP_DIR}/pages" "2" "0"
    assert_success
    assert_output --partial "tokens.json not found"
}

# --- Completion status ---

@test "batch-convert: shows remaining pages count" {
    make_pages "${TEST_TEMP_DIR}/pages"
    run_batch "${TEST_TEMP_DIR}/pages" "5" "2"
    assert_success
    assert_output --partial "3 pages remaining"
}

@test "batch-convert: shows completion message when all done" {
    make_pages "${TEST_TEMP_DIR}/pages"
    run_batch "${TEST_TEMP_DIR}/pages" "2" "2"
    assert_success
    assert_output --partial "All pages complete"
}

# --- Summary ---

@test "batch-convert: shows batch conversion summary" {
    make_pages "${TEST_TEMP_DIR}/pages"
    run_batch "${TEST_TEMP_DIR}/pages" "2" "0"
    assert_success
    assert_output --partial "Batch Conversion Summary"
    assert_output --partial "All page payloads valid"
}
