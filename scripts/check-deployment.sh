#!/bin/bash
# BUILD 630: Deployment verification — checks if live site matches expected build.
# Usage: ./scripts/check-deployment.sh [expected_build]
# If no build given, uses the local HEAD build number.

set -e
cd "$(dirname "$0")/.."

# Get expected build from prepare-build-entry.cjs or arg
if [ -n "$1" ]; then
  EXPECTED="$1"
else
  EXPECTED=$(grep -o '__AG_BUILD="[0-9]*"' scripts/prepare-build-entry.cjs | grep -o '[0-9]*' | head -1)
fi

echo "Expected build: $EXPECTED"
echo "Checking live site..."

LIVE=$(curl -s "https://jaydonweircontracting-ux.github.io/Adventure-game-/" | grep -o '__AG_BUILD="[0-9]*"' | grep -o '[0-9]*' | head -1)

echo "Live build: $LIVE"

if [ "$LIVE" = "$EXPECTED" ]; then
  echo "✅ LIVE — site matches expected build"
  exit 0
else
  echo "❌ STUCK — live ($LIVE) != expected ($EXPECTED)"
  echo "Triggering redeploy..."
  TOKEN=$(grep -oP 'https://[^:]+:\K[^@]+' ~/.git-credentials | head -1)
  CODE=$(curl -s -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/jaydonweircontracting-ux/Adventure-game-/actions/workflows/deploy-pages.yml/dispatches" \
    -d '{"ref":"main"}' -o /dev/null -w "%{http_code}")
  if [ "$CODE" = "204" ]; then
    echo "✅ Redeploy triggered (HTTP 204)"
  else
    echo "❌ Redeploy failed (HTTP $CODE)"
    exit 1
  fi
  exit 2
fi
