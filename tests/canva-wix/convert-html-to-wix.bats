#!/usr/bin/env bats
load '../test_helper'

SCRIPT="${PROJECT_ROOT}/scripts/canva-wix/convert-html-to-wix.sh"

# Helper: convert a file and pipe through jq for structured assertions
convert() {
    bash "$SCRIPT" "$1"
}

@test "convert-html-to-wix: output is valid JSON with version and source" {
    local html="${TEST_TEMP_DIR}/page.html"
    echo '<h1>Hello World</h1>' > "$html"
    run bash -c "bash '$SCRIPT' '$html' | jq -e '.version == 1 and .source == \"canva\"'"
    assert_success
}

@test "convert-html-to-wix: converts h1 to a heading block with level 1" {
    local html="${TEST_TEMP_DIR}/page.html"
    echo '<h1>Hello World</h1>' > "$html"
    run bash -c "bash '$SCRIPT' '$html' | jq -r '.blocks[0] | \"\(.type) \(.level) \(.text)\"'"
    assert_success
    assert_output "heading 1 Hello World"
}

@test "convert-html-to-wix: converts h2 to a heading block with level 2" {
    local html="${TEST_TEMP_DIR}/page.html"
    echo '<h2>Subtitle</h2>' > "$html"
    run bash -c "bash '$SCRIPT' '$html' | jq -r '.blocks[0].level'"
    assert_success
    assert_output "2"
}

@test "convert-html-to-wix: converts p to a paragraph block" {
    local html="${TEST_TEMP_DIR}/page.html"
    echo '<p>Body text here.</p>' > "$html"
    run bash -c "bash '$SCRIPT' '$html' | jq -r '.blocks[0] | \"\(.type):\(.text)\"'"
    assert_success
    assert_output "paragraph:Body text here."
}

@test "convert-html-to-wix: converts img to an image block with src and alt" {
    local html="${TEST_TEMP_DIR}/page.html"
    echo '<img src="hero.png" alt="Hero image" />' > "$html"
    run bash -c "bash '$SCRIPT' '$html' | jq -r '.blocks[0] | \"\(.type) \(.src) \(.alt)\"'"
    assert_success
    assert_output "image hero.png Hero image"
}

@test "convert-html-to-wix: wraps div content in balanced section markers" {
    local html="${TEST_TEMP_DIR}/page.html"
    cat > "$html" << 'HTML'
<div>
  <h2>Section Title</h2>
  <p>Section content.</p>
</div>
HTML
    run bash -c "bash '$SCRIPT' '$html' | jq -e '([.blocks[] | select(.type == \"section\" and .boundary == \"start\")] | length) == ([.blocks[] | select(.type == \"section\" and .boundary == \"end\")] | length) and ([.blocks[] | select(.type == \"section\")] | length) > 0'"
    assert_success
}

@test "convert-html-to-wix: converts anchor with button class to a button block" {
    local html="${TEST_TEMP_DIR}/page.html"
    echo '<a href="https://example.com" class="button">Click Me</a>' > "$html"
    run bash -c "bash '$SCRIPT' '$html' | jq -r '.blocks[0] | \"\(.type) \(.href) \(.text)\"'"
    assert_success
    assert_output "button https://example.com Click Me"
}

@test "convert-html-to-wix: converts ul lists to a list block with items" {
    local html="${TEST_TEMP_DIR}/page.html"
    cat > "$html" << 'HTML'
<ul>
  <li>Item one</li>
  <li>Item two</li>
</ul>
HTML
    run bash -c "bash '$SCRIPT' '$html' | jq -r '.blocks[0] | \"\(.type) \(.ordered) \(.items | length)\"'"
    assert_success
    assert_output "list false 2"
}

@test "convert-html-to-wix: converts ol lists to an ordered list block" {
    local html="${TEST_TEMP_DIR}/page.html"
    cat > "$html" << 'HTML'
<ol>
  <li>First</li>
  <li>Second</li>
</ol>
HTML
    run bash -c "bash '$SCRIPT' '$html' | jq -r '.blocks[0].ordered'"
    assert_success
    assert_output "true"
}

@test "convert-html-to-wix: fails gracefully with missing file" {
    run bash "$SCRIPT" "/nonexistent/page.html"
    assert_failure
    assert_output --partial "not found"
}

@test "convert-html-to-wix: handles multiple elements in order" {
    local html="${TEST_TEMP_DIR}/page.html"
    cat > "$html" << 'HTML'
<h1>Title</h1>
<p>Introduction paragraph.</p>
<h2>Section</h2>
<p>More content.</p>
HTML
    run bash -c "bash '$SCRIPT' '$html' | jq -r '[.blocks[].type] | join(\",\")'"
    assert_success
    assert_output "heading,paragraph,heading,paragraph"
}

@test "convert-html-to-wix: matches the committed fixture golden" {
    local fixture_html="${FIXTURES_DIR}/canva/landing/index.html"
    local golden="${FIXTURES_DIR}/canva/landing/expected-blocks.json"
    run bash -c "diff <(bash '$SCRIPT' '$fixture_html') '$golden'"
    assert_success
}
