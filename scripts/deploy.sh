#!/usr/bin/env bash
# deploy.sh — thin wrapper around the Wix publish orchestrator.
#
# Kept at scripts/deploy.sh so docs, agents, and muscle memory that reach for
# "the deploy script" land in the right place. All behavior lives in
# scripts/wix-deployment/publish.sh (see its --help).
#
# Usage: ./scripts/deploy.sh [--env <name>] [--dry-run] [--skip-checks] ...

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/wix-deployment/publish.sh" "$@"
