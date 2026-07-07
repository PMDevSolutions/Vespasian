#!/usr/bin/env bash
set -euo pipefail

# Dependency vulnerability scanner for Vespasian.
# Scans pnpm/npm dependencies at the workspace root (the pnpm lockfile covers
# every workspace package) plus any nested package with its own lockfile.
#
# Output: a single JSON document on stdout —
#   { scan_date, scan_path, results: [ { scanner, status, vulnerabilities: [...] } ] }
# consumed by generate-report.sh and create-issues.sh.
#
# Usage: scan-dependencies.sh [scan-path]
#   scan-path  Directory to scan (default: .)
#
# Exit codes:
#   0 — no vulnerabilities found
#   1 — vulnerabilities found
#   2 — scanner error

SCAN_PATH="${1:-.}"
SCAN_PATH="$(cd "$SCAN_PATH" && pwd)"
SCAN_DATE="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Detect Python 3 command (python3 or python)
# Use version check to avoid Windows Store stubs that register but don't execute
PYTHON=""
if python3 --version >/dev/null 2>&1; then
  PYTHON="python3"
elif python --version >/dev/null 2>&1; then
  PYTHON="python"
fi

if [[ -z "$PYTHON" ]]; then
  echo "[ERROR] Python 3 is required but not found" >&2
  exit 2
fi

# All informational/warning output goes to stderr
log()  { echo "[INFO]  $*" >&2; }
warn() { echo "[WARN]  $*" >&2; }
err()  { echo "[ERROR] $*" >&2; }

HAS_PNPM=false
HAS_NPM=false

command -v pnpm >/dev/null 2>&1 && HAS_PNPM=true
command -v npm  >/dev/null 2>&1 && HAS_NPM=true

if ! $HAS_PNPM && ! $HAS_NPM; then
  warn "Neither pnpm nor npm found — JS dependency scans will be skipped"
fi

# Accumulator for result JSON fragments (one per scanner invocation)
RESULTS=()

# ─── Helpers ─────────────────────────────────────────────────────────────────

# Parse pnpm/npm audit JSON into normalised vulnerability objects.
parse_js_vulns() {
  local scanner_label="$1"
  $PYTHON -c "
import json, sys

raw = sys.stdin.read()
data = json.loads(raw)
vulns = []

# npm/pnpm audit JSON: 'vulnerabilities' is a dict keyed by package name
vuln_map = data.get('vulnerabilities', {})
for pkg, info in vuln_map.items():
    sev = (info.get('severity') or 'unknown').lower()
    via = info.get('via', [])
    title = ''
    cve = ''
    desc = ''
    affected = info.get('range', '')
    if via and isinstance(via[0], dict):
        first = via[0]
        title = first.get('title', first.get('name', ''))
        cve = first.get('cve') or ''
        desc = first.get('title', '')
        affected = first.get('range', affected)
    elif via and isinstance(via[0], str):
        title = via[0]
        desc = 'Dependency of ' + via[0]

    vulns.append({
        'package': pkg,
        'severity': sev,
        'title': title,
        'description': desc,
        'cve': cve,
        'affected_versions': affected,
        'source': '$scanner_label'
    })

json.dump(vulns, sys.stdout)
" 2>/dev/null
}

# Run pnpm or npm audit in a given directory and append result to RESULTS.
# $1 = directory, $2 = label
scan_js() {
  local dir="$1" label="$2"

  local has_lockfile=false tool=""
  if [[ -f "$dir/pnpm-lock.yaml" ]] && $HAS_PNPM; then
    has_lockfile=true; tool="pnpm"
  elif [[ -f "$dir/package-lock.json" ]] && $HAS_NPM; then
    has_lockfile=true; tool="npm"
  elif [[ -f "$dir/yarn.lock" ]]; then
    warn "$label: yarn.lock detected but yarn audit is not supported — skipping"
    RESULTS+=("{\"scanner\":\"$label\",\"status\":\"skipped\",\"vulnerabilities\":[]}")
    return
  fi

  if ! $has_lockfile; then
    if [[ -f "$dir/package.json" ]]; then
      warn "$label: package.json found but no supported lock file — skipping"
    fi
    RESULTS+=("{\"scanner\":\"$label\",\"status\":\"skipped\",\"vulnerabilities\":[]}")
    return
  fi

  log "$label: running $tool audit …"
  local raw
  if raw="$(cd "$dir" && $tool audit --json 2>/dev/null)"; then
    # exit 0 → no vulnerabilities
    RESULTS+=("{\"scanner\":\"$label\",\"status\":\"clean\",\"vulnerabilities\":[]}")
  else
    local vulns
    if vulns="$(echo "$raw" | parse_js_vulns "$tool-audit")"; then
      if [[ "$vulns" == "[]" ]]; then
        RESULTS+=("{\"scanner\":\"$label\",\"status\":\"clean\",\"vulnerabilities\":[]}")
      else
        RESULTS+=("{\"scanner\":\"$label\",\"status\":\"vulnerable\",\"vulnerabilities\":$vulns}")
      fi
    else
      warn "$label: failed to parse $tool audit output"
      RESULTS+=("{\"scanner\":\"$label\",\"status\":\"error\",\"vulnerabilities\":[]}")
    fi
  fi
}

# ─── Main scanning ───────────────────────────────────────────────────────────

log "Scanning dependencies in $SCAN_PATH"

# 1. Workspace root (pnpm-lock.yaml covers all @vespasian/* workspace packages)
scan_js "$SCAN_PATH" "pnpm"

# 2. Nested packages that carry their own lockfiles (rare under pnpm, but
#    scaffolded standalone projects may have them)
if [[ -d "$SCAN_PATH/packages" ]]; then
  for pkg_dir in "$SCAN_PATH"/packages/*/; do
    [[ -d "$pkg_dir" ]] || continue
    name="$(basename "$pkg_dir")"
    if [[ -f "$pkg_dir/pnpm-lock.yaml" || -f "$pkg_dir/package-lock.json" || -f "$pkg_dir/yarn.lock" ]]; then
      scan_js "$pkg_dir" "pnpm:packages/$name"
    fi
  done
fi

# ─── Build final JSON output ────────────────────────────────────────────────

# Join RESULTS array into a JSON array
RESULTS_JSON="["
for i in "${!RESULTS[@]}"; do
  [[ $i -gt 0 ]] && RESULTS_JSON+=","
  RESULTS_JSON+="${RESULTS[$i]}"
done
RESULTS_JSON+="]"

OUTPUT="$($PYTHON -c "
import json, sys

results = json.loads(sys.argv[1])
output = {
    'scan_date': sys.argv[2],
    'scan_path': sys.argv[3],
    'results': results
}
print(json.dumps(output, indent=2))
" "$RESULTS_JSON" "$SCAN_DATE" "$SCAN_PATH")"

echo "$OUTPUT"

# ─── Determine exit code ────────────────────────────────────────────────────

has_vulns=false
has_errors=false

for r in "${RESULTS[@]}"; do
  status="$(echo "$r" | $PYTHON -c "import json,sys; print(json.load(sys.stdin)['status'])" 2>/dev/null || true)"
  case "$status" in
    vulnerable) has_vulns=true ;;
    error)      has_errors=true ;;
  esac
done

if $has_vulns; then
  log "Vulnerabilities found — exit 1"
  exit 1
elif $has_errors; then
  warn "Scanner errors occurred — exit 2"
  exit 2
else
  log "No vulnerabilities found — exit 0"
  exit 0
fi
