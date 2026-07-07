#!/usr/bin/env bash
# rollback.sh — the honest version.
#
# WIX HAS NO PUBLIC ROLLBACK/REVERT API. The Site Actions API family covers
# duplicate + publish only; there is no endpoint that restores a previous
# published revision. Reverting a Wix site is a MANUAL operation in the Wix
# dashboard ("Site History"), and this script documents that path instead of
# pretending to automate it.
#
# Manual revert path:
#   1. Open  https://manage.wix.com/  and select the site
#   2. Settings → Site & Business (or search "Site History")
#   3. Site History → pick the version from before the bad publish
#   4. "View & Restore" → Restore — this loads that version into the EDITOR
#   5. Review in the editor, then Publish to push the restored version live
#
# Notes:
#   * Restoring affects design/content, NOT CMS collection data. Data changes
#     made by the `data` phase must be reverted through the CMS (or re-applied
#     from a previous plan).
#   * For Git-integrated (Studio) sites, code (global.css / Velo) can be
#     reverted with git: `git revert` in the site repo, then `wix publish`.
#   * The best rollback is a re-apply: keep the previous BuildPlan under
#     .vespasian/plans/ and run `vespasian apply <previous-plan>` + publish.
#
# Usage:
#   rollback.sh [--env <name>] --acknowledge-manual
#
# Without --acknowledge-manual this exits 1, so any automation that expected
# an automatic rollback fails loudly instead of silently "succeeding".

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/common.sh"

ENV_NAME=""
ACKNOWLEDGED=false

usage() {
  sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENV_NAME="$2"; shift 2 ;;
    --acknowledge-manual) ACKNOWLEDGED=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) log_error "Unknown argument: $1"; usage; exit 2 ;;
  esac
done

banner "Wix rollback${ENV_NAME:+ (env=$ENV_NAME)}"

log_warn "Wix exposes NO public revert API — rollback is manual."
log_event "rollback_manual_required" "env=${ENV_NAME:-default}"

cat >&2 <<'EOF'

  Manual revert via the Wix dashboard:

    1. Open  https://manage.wix.com/  and select the site
    2. Search "Site History" (Settings → Site & Business)
    3. Pick the version from before the bad publish
    4. "View & Restore" → Restore  (loads that version into the editor)
    5. Review, then Publish to push the restored version live

  Alternatives:

    * Re-apply a previous BuildPlan:  vespasian apply .vespasian/plans/<previous>.json
      then: vespasian publish
    * Git-integrated code (global.css / Velo): git revert in the site repo,
      then `wix publish`.

  Site History restores design/content only — CMS collection data is NOT
  reverted and must be fixed through the CMS or a data-phase re-apply.

EOF

if $ACKNOWLEDGED; then
  log_ok "Manual rollback path acknowledged (--acknowledge-manual)"
  log_event "rollback_acknowledged" "env=${ENV_NAME:-default}"
  exit 0
fi

log_error "Exiting non-zero: no automatic rollback was performed."
log_error "Re-run with --acknowledge-manual once the manual restore is done (or planned)."
exit 1
