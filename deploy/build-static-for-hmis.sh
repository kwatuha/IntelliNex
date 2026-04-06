#!/usr/bin/env bash
# Build static export for hosting under /hmis (basePath is set in next.config.mjs).
#
# Before running:
#   • Copy .env.example → .env (or edit existing .env)
#   • Set NEXT_PUBLIC_API_URL to your public API URL (reachable from browsers; HTTPS in production).
#   • Set NEXT_PUBLIC_BASE_URL to your static site URL including /hmis, e.g. https://your-domain.com/hmis
#
# Then:
#   ./deploy/build-static-for-hmis.sh
#
# Deploy: upload everything inside ./out/ to public_html/hmis/ on the host (keep .htaccess).
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "ERROR: Missing .env in repo root. Copy .env.example to .env and set NEXT_PUBLIC_API_URL (and optional NEXT_PUBLIC_BASE_URL)." >&2
  exit 1
fi

# Load for display only (do not print secrets)
set -a
# shellcheck disable=SC1091
source .env
set +a

API_HINT="${NEXT_PUBLIC_API_URL:-<unset>}"
BASE_HINT="${NEXT_PUBLIC_BASE_URL:-<unset>}"
echo "==> NEXT_PUBLIC_API_URL=$API_HINT"
echo "==> NEXT_PUBLIC_BASE_URL=$BASE_HINT"
echo "==> npm run build …"
npm run build

echo ""
echo "==> Build finished. Next: upload all files under: $ROOT/out/"
echo "    to public_html/hmis/ on static hosting. Open https://your-domain/hmis"
