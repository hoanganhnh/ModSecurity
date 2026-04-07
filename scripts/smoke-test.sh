#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

docker compose config >/dev/null

docker compose up -d --build

HEALTH_OUT="$(mktemp)"
ALLOW_OUT="$(mktemp)"
BLOCK_OUT="$(mktemp)"
trap 'rm -f "$HEALTH_OUT" "$ALLOW_OUT" "$BLOCK_OUT"' EXIT

for _ in {1..60}; do
  HEALTH_CODE="$(curl -s -o "$HEALTH_OUT" -w "%{http_code}" "http://localhost:${DEMO_PORT:-8080}/health" || true)"
  if [[ "$HEALTH_CODE" == "200" ]]; then
    break
  fi
  sleep 1
done

if [[ "${HEALTH_CODE:-}" != "200" ]]; then
  docker compose logs --tail=120
  echo "health check failed: ${HEALTH_CODE:-none}"
  exit 1
fi

ALLOW_CODE="$(curl -s -o "$ALLOW_OUT" -w "%{http_code}" -X POST "http://localhost:${DEMO_PORT:-8080}/api/search" -H 'content-type: application/json' --data '{"endpoint":"/api/search","payload":"q=normal-search"}')"
if [[ "$ALLOW_CODE" != "200" ]]; then
  echo "allow scenario failed: $ALLOW_CODE"
  exit 1
fi

BLOCK_CODE="$(curl -s -o "$BLOCK_OUT" -w "%{http_code}" -X POST "http://localhost:${DEMO_PORT:-8080}/api/search" -H 'content-type: application/json' --data '{"endpoint":"/api/search","payload":"q='"'"' OR 1=1 --"}')"
if [[ "$BLOCK_CODE" != "403" ]]; then
  echo "block scenario expected 403 but got: $BLOCK_CODE"
  exit 1
fi

echo "smoke test passed"
