#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="${1:-reset}"

case "$MODE" in
  reset)
    docker compose down -v --remove-orphans
    echo "stack reset complete"
    ;;
  detection-only)
    docker compose down --remove-orphans
    MODSEC_RULE_ENGINE=DetectionOnly docker compose up -d --build
    echo "stack started in detection-only mode"
    ;;
  *)
    echo "usage: scripts/rollback-local.sh [reset|detection-only]"
    exit 1
    ;;
esac
