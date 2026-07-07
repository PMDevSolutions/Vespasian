#!/usr/bin/env bash
# tests/visual/seed.sh
#
# Deterministic-content seeding for the visual regression suite — Wix edition.
#
# On the WordPress ancestor this script wrote fixture posts/products into a
# local database. Wix has no local database: deterministic content is whatever
# the last `vespasian apply` put on the target site (pages via the editor
# plane, CMS items via the data phase). Seeding therefore means re-applying a
# known BuildPlan, not running this script.
#
# This stub exists so `pnpm visual:seed` keeps working and explains the path.
# It no-ops (exit 0) with a clear message unless WIX_SITE_ID is set.

set -euo pipefail

if [ -z "${WIX_SITE_ID:-}" ]; then
  echo "visual seed: WIX_SITE_ID is not set — nothing to seed."
  echo ""
  echo "  Visual baselines are captured from a real published Wix site."
  echo "  To prepare one deterministically:"
  echo "    1. vespasian site use <site-guid>        # pins WIX_SITE_ID"
  echo "    2. vespasian apply <fixture-plan>.json    # pages + CMS data phases"
  echo "    3. vespasian publish"
  echo "    4. WIX_SITE_URL=<published-url> pnpm visual:capture"
  exit 0
fi

echo "visual seed: WIX_SITE_ID is set."
echo ""
echo "  Seeding a Wix site = applying a known BuildPlan (there is no direct"
echo "  content-write shortcut for pages; CMS items go through the data phase):"
echo ""
echo "    vespasian apply .vespasian/plans/<fixture-plan>.json"
echo "    vespasian publish"
echo ""
echo "  Then capture: WIX_SITE_URL=<published-url> pnpm visual:capture"
exit 0
