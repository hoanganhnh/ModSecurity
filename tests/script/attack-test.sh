#!/usr/bin/env bash
set -u

# Usage:
#   ./attack-test.sh
#   BASE_URL=http://127.0.0.1:8080 ./attack-test.sh
#   ./attack-test.sh http://127.0.0.1:3000
BASE_URL="${1:-${BASE_URL:-http://127.0.0.1:3000}}"

pass=0
fail=0
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

print_fail_preview() {
local file="$1"
echo "  body: $(tr '\n' ' ' <"$file" | cut -c1-220)"
}

run_case() {
local name="$1"
local expected_codes="$2"
shift 2

local out="$TMP_DIR/$(echo "$name" | tr ' /' '__').body"
local code
code="$(curl -sS -o "$out" -w "%{http_code}" "$@" || true)"

local ok=1
if [[ " $expected_codes " != *" $code "* ]]; then
    ok=0
fi

# If app returns 200, require decision=BLOCK in JSON body
if [[ "$ok" -eq 1 && "$code" == "200" ]]; then
    if ! grep -Eq '"decision"[[:space:]]*:[[:space:]]*"BLOCK"' "$out"; then
    ok=0
    fi
fi

if [[ "$ok" -eq 1 ]]; then
    echo "PASS | $name | HTTP $code"
    pass=$((pass + 1))
else
    echo "FAIL | $name | HTTP $code (expected: $expected_codes)"
    print_fail_preview "$out"
    fail=$((fail + 1))
fi
}

echo "Target: $BASE_URL"

health_code="$(curl -sS -o /dev/null -w "%{http_code}" "$BASE_URL/health" || true)"
if [[ "$health_code" != "200" ]]; then
echo "FAIL | health check | HTTP $health_code (expected: 200)"
exit 1
fi
echo "PASS | health check | HTTP 200"

# 1) /api/login attack
run_case "POST /api/login xss attack" "200 403" \
-X POST "$BASE_URL/api/login" \
-H 'content-type: application/json' \
--data '{"username":"<script>alert(1)</script>","password":"safe-password"}'

# 2) /api/search attack
run_case "GET /api/search sqli attack" "200 403" \
-G "$BASE_URL/api/search" \
--data-urlencode "q=' OR 1=1 --"

# 3) /api/comment attack
run_case "POST /api/comment xss attack" "200 403" \
-X POST "$BASE_URL/api/comment" \
-H 'content-type: application/json' \
--data '{"productId":1,"content":"<script>alert(1)</script>"}'

# 4) /api/files traversal attack
run_case "GET /api/files traversal attack" "200 403" \
-G "$BASE_URL/api/files" \
--data-urlencode "file=../../etc/passwd"

# 5) /api/admin unauthorized/invalid token
run_case "GET /api/admin invalid token" "403 503" \
-X GET "$BASE_URL/api/admin" \
-H 'x-admin-token: wrong-token'

echo
echo "Result: PASS=$pass FAIL=$fail"
[[ "$fail" -eq 0 ]]
