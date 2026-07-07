#!/usr/bin/env bash
# convert-html-to-wix.sh
# Converts Canva-exported HTML into Vespasian's neutral content-block JSON —
# the shape the BuildPlan compiler consumes as the content model input
# (packages/wix-driver/src/plan/schema.js ContentBlockSchema) and the
# wix-site-builder agent uses as canvas-composition hints.
#
# Output:
#   { "version": 1, "source": "canva", "blocks": [
#       { "type": "heading",   "level": 1, "text": "..." },
#       { "type": "paragraph", "text": "..." },
#       { "type": "image",     "src": "...", "alt": "..." },
#       { "type": "button",    "href": "...", "text": "..." },
#       { "type": "list",      "ordered": false, "items": ["..."] },
#       { "type": "section",   "boundary": "start" }, ... { "type": "section", "boundary": "end" }
#   ] }
#
# Section boundaries are balanced markers (one pair per source <div>) so a
# consumer can rebuild nesting. Requires jq; awk usage is POSIX (no gawk).
#
# Usage: convert-html-to-wix.sh <input.html>
set -e

INPUT_FILE="${1:-}"

if [[ -z "$INPUT_FILE" || ! -f "$INPUT_FILE" ]]; then
    echo "Error: File '${INPUT_FILE}' not found." >&2
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
    echo "Error: jq is required (https://jqlang.github.io/jq/)." >&2
    exit 1
fi

# Read the entire file, collapse to one line, normalise inter-tag whitespace,
# then split so each top-level element sits on its own line.
content="$(cat "$INPUT_FILE" | tr '\n' ' ' | sed -E 's/>[[:space:]]+</></g')"

# Insert a newline before every opening tag (not closing tags like </h1>).
# Also split before closing container tags (</div>, </ul>, </ol>) so they
# get their own line for proper section / list closing. A control-char
# placeholder is used because BSD sed has no \xNN escapes (portability).
SEP=$'\001'
content="$(echo "$content" \
    | sed -E "s/<([a-zA-Z])/${SEP}<\1/g" \
    | sed -E "s/<\/(div|ul|ol)>/${SEP}<\/\1>/g" \
    | tr '\001' '\n' \
    | sed '/^$/d')"

# Emit one JSON object per line (NDJSON) via POSIX awk, then assemble with jq.
echo "$content" | awk '
BEGIN { in_ul = 0; in_ol = 0; n_items = 0 }

function esc(s) {
    gsub(/\\/, "\\\\", s)
    gsub(/"/, "\\\"", s)
    gsub(/\t/, " ", s)
    gsub(/\r/, "", s)
    return s
}

function trim(s) {
    sub(/^[ \t]+/, "", s)
    sub(/[ \t]+$/, "", s)
    return s
}

# Extract the value of attr="..." from line s ("" when absent).
function attr(s, name,    re, frag) {
    re = name "=\"[^\"]*\""
    if (match(s, re)) {
        frag = substr(s, RSTART, RLENGTH)
        sub(name "=\"", "", frag)
        sub(/"$/, "", frag)
        return frag
    }
    return ""
}

function flush_list(    i, out) {
    if (!in_ul && !in_ol) return
    out = "{\"type\":\"list\",\"ordered\":" (in_ol ? "true" : "false") ",\"items\":["
    for (i = 1; i <= n_items; i++) {
        if (i > 1) out = out ","
        out = out "\"" items[i] "\""
    }
    out = out "]}"
    print out
    in_ul = 0; in_ol = 0; n_items = 0
    delete items
}

# --- list item accumulation ---
/^<li/ {
    if (in_ul || in_ol) {
        line = $0
        sub(/^<li[^>]*>/, "", line)
        sub(/<\/li>.*$/, "", line)
        n_items++
        items[n_items] = esc(trim(line))
        next
    }
}

# --- list open / close ---
/^<ul/ { flush_list(); in_ul = 1; next }
/^<ol/ { flush_list(); in_ol = 1; next }
/^<\/ul>/ { flush_list(); next }
/^<\/ol>/ { flush_list(); next }

# --- section close ---
/^<\/div>/ {
    flush_list()
    print "{\"type\":\"section\",\"boundary\":\"end\"}"
    next
}

# Flush a pending list if we hit a non-list element
{
    if ((in_ul || in_ol) && $0 !~ /^<li/) flush_list()
}

# --- headings h1-h6 ---
/^<h[1-6][ >]/ {
    lvl = substr($0, 3, 1)
    line = $0
    sub(/^<h[1-6][^>]*>/, "", line)
    sub(/<\/h[1-6]>.*$/, "", line)
    printf "{\"type\":\"heading\",\"level\":%s,\"text\":\"%s\"}\n", lvl, esc(trim(line))
    next
}

# --- paragraph ---
/^<p[ >]/ {
    line = $0
    sub(/^<p[^>]*>/, "", line)
    sub(/<\/p>.*$/, "", line)
    printf "{\"type\":\"paragraph\",\"text\":\"%s\"}\n", esc(trim(line))
    next
}

# --- image (self-closing) ---
/^<img[ ]/ {
    printf "{\"type\":\"image\",\"src\":\"%s\",\"alt\":\"%s\"}\n", esc(attr($0, "src")), esc(attr($0, "alt"))
    next
}

# --- button (anchor with class containing "button") ---
/^<a [^>]*class="[^"]*button[^"]*"/ {
    line = $0
    sub(/^<a[^>]*>/, "", line)
    sub(/<\/a>.*$/, "", line)
    printf "{\"type\":\"button\",\"href\":\"%s\",\"text\":\"%s\"}\n", esc(attr($0, "href")), esc(trim(line))
    next
}

# --- section open ---
/^<div/ {
    print "{\"type\":\"section\",\"boundary\":\"start\"}"
    next
}

# --- everything else (doctype, html/head/body chrome, unknown tags): drop ---
{ next }

END {
    flush_list()
}
' | jq -s '{ version: 1, source: "canva", blocks: . }'
