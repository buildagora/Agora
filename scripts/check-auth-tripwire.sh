#!/bin/bash
# Tripwire: Fail if banned auth patterns are found
# This prevents legacy/test auth code from creeping back in

set -e

BANNED_PATTERNS=(
  "login-as"
  "TEST_ACCOUNT|TEST_ACCOUNT_LOGIN|TEST_LOGIN"
  "getPostLoginRedirect"
  "assertRolePathMatch"
  "localStorage.*auth|auth.*localStorage"
  "sessionStorage.*auth|auth.*sessionStorage"
  "jwtDecode|decodeJwt"
  "token\.role"
  "/api/dev/"
  "mockUsers|hardcodedUsers"
)

FAILED=0

echo "🔍 Checking for banned auth patterns..."

for pattern in "${BANNED_PATTERNS[@]}"; do
  # Search in src directory only, exclude node_modules and .next
  # Exclude lines that are comments or contain DEPRECATED/blocked
  matches=$(grep -r -E "$pattern" src/ --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null | \
    grep -vE "^\s*(//|/\*|\*)" | \
    grep -vE "DEPRECATED|blocked|throw new Error" || true)
  
  if [ -n "$matches" ]; then
    echo "❌ FAILED: Found banned pattern: $pattern"
    echo "$matches"
    FAILED=1
  fi
done

if [ $FAILED -eq 1 ]; then
  echo ""
  echo "🚨 TRIPWIRE TRIGGERED: Banned auth patterns detected!"
  echo "These patterns are not allowed in production auth code:"
  echo "  - Dev/test login helpers (login-as, TEST_ACCOUNT_LOGIN)"
  echo "  - Role guessing helpers (getPostLoginRedirect, assertRolePathMatch)"
  echo "  - Client storage auth (localStorage, sessionStorage)"
  echo "  - JWT decoding on client (jwtDecode, decodeJwt, token.role)"
  echo "  - Default routing to /seller/feed"
  echo ""
  echo "Use only the production auth surface:"
  echo "  - /api/auth/sign-in"
  echo "  - /api/auth/sign-up"
  echo "  - /api/auth/sign-out"
  echo "  - /api/auth/me"
  echo "  - src/lib/auth/AuthProvider.tsx"
  echo "  - src/lib/authGuard.tsx"
  exit 1
fi

echo "✅ No banned patterns found"
exit 0


# This prevents legacy/test auth code from creeping back in

set -e

BANNED_PATTERNS=(
  "login-as"
  "TEST_ACCOUNT|TEST_ACCOUNT_LOGIN|TEST_LOGIN"
  "getPostLoginRedirect"
  "assertRolePathMatch"
  "localStorage.*auth|auth.*localStorage"
  "sessionStorage.*auth|auth.*sessionStorage"
  "jwtDecode|decodeJwt"
  "token\.role"
  "/api/dev/"
  "mockUsers|hardcodedUsers"
)

FAILED=0

echo "🔍 Checking for banned auth patterns..."

for pattern in "${BANNED_PATTERNS[@]}"; do
  # Search in src directory only, exclude node_modules and .next
  # Exclude lines that are comments or contain DEPRECATED/blocked
  matches=$(grep -r -E "$pattern" src/ --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null | \
    grep -vE "^\s*(//|/\*|\*)" | \
    grep -vE "DEPRECATED|blocked|throw new Error" || true)
  
  if [ -n "$matches" ]; then
    echo "❌ FAILED: Found banned pattern: $pattern"
    echo "$matches"
    FAILED=1
  fi
done

if [ $FAILED -eq 1 ]; then
  echo ""
  echo "🚨 TRIPWIRE TRIGGERED: Banned auth patterns detected!"
  echo "These patterns are not allowed in production auth code:"
  echo "  - Dev/test login helpers (login-as, TEST_ACCOUNT_LOGIN)"
  echo "  - Role guessing helpers (getPostLoginRedirect, assertRolePathMatch)"
  echo "  - Client storage auth (localStorage, sessionStorage)"
  echo "  - JWT decoding on client (jwtDecode, decodeJwt, token.role)"
  echo "  - Default routing to /seller/feed"
  echo ""
  echo "Use only the production auth surface:"
  echo "  - /api/auth/sign-in"
  echo "  - /api/auth/sign-up"
  echo "  - /api/auth/sign-out"
  echo "  - /api/auth/me"
  echo "  - src/lib/auth/AuthProvider.tsx"
  echo "  - src/lib/authGuard.tsx"
  exit 1
fi

echo "✅ No banned patterns found"
exit 0

