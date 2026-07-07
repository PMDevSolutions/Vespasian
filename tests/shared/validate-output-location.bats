#!/usr/bin/env bats
# Tests for scripts/shared/validate-output-location.sh
# The guard blocks WordPress-style output paths — Vespasian artifacts live in
# .vespasian/ and packages/, never themes//plugins//wp-content/.

load '../test_helper'

SCRIPT="${PROJECT_ROOT}/scripts/shared/validate-output-location.sh"

# --- No input ---

@test "validate-output-location: allows operation when no tool input" {
    CLAUDE_TOOL_INPUT="" run bash "$SCRIPT" < /dev/null
    assert_success
}

# --- Valid Vespasian paths ---

@test "validate-output-location: allows .vespasian/ paths" {
    CLAUDE_TOOL_INPUT='{"file_path":".vespasian/plans/site.json"}' run bash "$SCRIPT"
    assert_success
}

@test "validate-output-location: allows packages/ paths" {
    CLAUDE_TOOL_INPUT='{"file_path":"packages/wix-driver/src/plan/compile.js"}' run bash "$SCRIPT"
    assert_success
}

@test "validate-output-location: allows docs and unrelated paths" {
    CLAUDE_TOOL_INPUT='{"file_path":"docs/wix/ARCHITECTURE.md"}' run bash "$SCRIPT"
    assert_success
}

# --- Blocked WordPress-style paths ---

@test "validate-output-location: blocks themes/ path" {
    CLAUDE_TOOL_INPUT='{"file_path":"themes/my-theme/style.css"}' run bash "$SCRIPT"
    assert_failure
    assert_output --partial "output location detected"
}

@test "validate-output-location: blocks plugins/ path" {
    CLAUDE_TOOL_INPUT='{"file_path":"plugins/my-plugin/plugin.php"}' run bash "$SCRIPT"
    assert_failure
}

@test "validate-output-location: blocks mu-plugins/ path" {
    CLAUDE_TOOL_INPUT='{"file_path":"mu-plugins/custom.php"}' run bash "$SCRIPT"
    assert_failure
}

@test "validate-output-location: blocks wp-content/ path" {
    CLAUDE_TOOL_INPUT='{"file_path":"wp-content/themes/my-theme/style.css"}' run bash "$SCRIPT"
    assert_failure
    assert_output --partial "output location detected"
}

@test "validate-output-location: blocks nested wp-content paths" {
    CLAUDE_TOOL_INPUT='{"file_path":"some/dir/wp-content/plugins/x.php"}' run bash "$SCRIPT"
    assert_failure
}

# --- Guidance in the block message ---

@test "validate-output-location: block message points at .vespasian/ and packages/" {
    CLAUDE_TOOL_INPUT='{"file_path":"themes/my-theme/style.css"}' run bash "$SCRIPT"
    assert_failure
    assert_output --partial ".vespasian/plans/"
    assert_output --partial "packages/"
}

# --- Alternate JSON keys ---

@test "validate-output-location: handles 'path' key in JSON input" {
    CLAUDE_TOOL_INPUT='{"path":"wp-content/themes/my-theme/index.html"}' run bash "$SCRIPT"
    assert_failure
}

# --- Stdin fallback ---

@test "validate-output-location: reads tool input from stdin when env unset" {
    run bash -c "unset CLAUDE_TOOL_INPUT; echo '{\"tool_input\":{\"file_path\":\"themes/x/style.css\"}}' | bash '$SCRIPT'"
    assert_failure
}

# --- No file path in input ---

@test "validate-output-location: allows operation when no file path in JSON" {
    CLAUDE_TOOL_INPUT='{"some_other_key":"value"}' run bash "$SCRIPT"
    assert_success
}
