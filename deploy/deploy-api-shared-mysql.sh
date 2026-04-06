#!/usr/bin/env bash
# =============================================================================
# Deploy API only — shared Docker MySQL on the same host (docker-compose.shared-mysql-api-only.yml)
# =============================================================================
#
# Typical layout: static Next export + basePath on host A; this API on host B (VPS) with Docker,
# attached to the existing `db` container network (e.g. projects_default).
#
# .env on the server (no sudo needed — lives in your home dir):
#   Option A — copy from your laptop (recommended):
#     Put secrets in deploy/.env.api-server (gitignored). If that file exists, it is copied to
#     the server as .env automatically — you do not need LOCAL_ENV_FILE.
#     Override path: LOCAL_ENV_FILE=./path/to/other.env ./deploy/deploy-api-shared-mysql.sh ...
#     Relative paths resolve from repo root; absolute paths work too.
#   Option B — create on the server: nano ~/intellinex-api/.env
#
# Variables to include (cp deploy/env.api-server.example deploy/.env.api-server, fill secrets, then deploy):
#   EXTERNAL_MYSQL_DOCKER_NETWORK=projects_default
#   DB_HOST=db
#   DB_PORT=3306
#   DB_USER=  DB_PASSWORD=  DB_NAME=   (or MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE — either works)
#   JWT_SECRET=
#   ZOOM_CLIENT_ID=  ZOOM_CLIENT_SECRET=   # telemedicine Meeting SDK signatures
#   FRONTEND_URL=https://your-static-site.example.com   # exact browser Origin (no path) — required for CORS
#   NEXT_PUBLIC_API_URL is NOT used by the API container; set it when *building* the static frontend to this API URL.
#
# Telemedicine (static UI + remote API):
#   - Works if NEXT_PUBLIC_API_URL points at this API and FRONTEND_URL matches the static site origin.
#   - In Zoom Marketplace, allow your Meeting SDK app domain to include the static site origin (and often localhost for dev).
#   - Static host may need COOP/COEP headers for embedded Zoom (see next.config.mjs comments / .htaccess on static host).
#
# Usage:
#   ./deploy/deploy-api-shared-mysql.sh [SERVER_IP] [SSH_KEY_PATH]
#   SERVER_IP=165.22.227.234 SSH_USER=kunye SSH_KEY_PATH=~/.ssh/id_asusme ./deploy/deploy-api-shared-mysql.sh
#
# Optional:
#   LOCAL_ENV_FILE=./deploy/.env.api-server — scp this file to ~/REMOTE_DIR/.env before docker compose
#   REMOTE_DIR=intellinex-api          — directory under remote $HOME
#   DEPLOY_USE_DOCKER_CACHE=1          — omit --no-cache on build
#   DEPLOY_RUN_TELEMEDICINE_MIGRATIONS=1 — after up, run npm run migrate:telemedicine in the container
#
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  sed -n '1,45p' "$0"
  exit 0
fi

SERVER_IP="${SERVER_IP:-165.22.227.234}"
SSH_USER="${SSH_USER:-kunye}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/id_asusme}"
REMOTE_DIR="${REMOTE_DIR:-intellinex-api}"
COMPOSE_FILE="docker-compose.shared-mysql-api-only.yml"

[[ -n "${1:-}" ]] && SERVER_IP="$1"
[[ -n "${2:-}" ]] && SSH_KEY_PATH="$2"
SSH_KEY_PATH="${SSH_KEY_PATH/#\~/$HOME}"

LOCAL_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RSYNC_RSH="ssh -i $SSH_KEY_PATH -o StrictHostKeyChecking=accept-new"
REMOTE="${SSH_USER}@${SERVER_IP}:~/${REMOTE_DIR}/"

BUILD_NO_CACHE="--no-cache"
[[ "${DEPLOY_USE_DOCKER_CACHE:-}" == "1" ]] && BUILD_NO_CACHE=""

echo "==> Local repo: $LOCAL_ROOT"
echo "==> Remote:     $REMOTE"
echo "==> Compose:    $COMPOSE_FILE"

if [[ ! -f "$LOCAL_ROOT/api/Dockerfile.prod" ]]; then
  echo "ERROR: api/Dockerfile.prod not found." >&2
  exit 1
fi

if [[ ! -f "$LOCAL_ROOT/$COMPOSE_FILE" ]]; then
  echo "ERROR: $COMPOSE_FILE not found." >&2
  exit 1
fi

echo "==> Ensure remote directory exists: ~/${REMOTE_DIR}/"
ssh -i "$SSH_KEY_PATH" -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
  "$SSH_USER@$SERVER_IP" "mkdir -p \"\$HOME/${REMOTE_DIR}/api\""

# Auto-use deploy/.env.api-server when present (no need to set LOCAL_ENV_FILE).
if [[ -z "${LOCAL_ENV_FILE:-}" && -f "$LOCAL_ROOT/deploy/.env.api-server" ]]; then
  LOCAL_ENV_FILE="deploy/.env.api-server"
  echo "==> Using default env file: deploy/.env.api-server"
fi

if [[ -n "${LOCAL_ENV_FILE:-}" ]]; then
  ENV_SRC="$LOCAL_ENV_FILE"
  if [[ "$ENV_SRC" != /* ]]; then
    ENV_SRC="$LOCAL_ROOT/$ENV_SRC"
  fi
  if [[ ! -f "$ENV_SRC" ]]; then
    echo "ERROR: LOCAL_ENV_FILE not found: ${LOCAL_ENV_FILE} (resolved: ${ENV_SRC})" >&2
    exit 1
  fi
  echo "==> scp .env → ${SSH_USER}@${SERVER_IP}:~/${REMOTE_DIR}/.env (from ${ENV_SRC})"
  scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=accept-new \
    "$ENV_SRC" "${SSH_USER}@${SERVER_IP}:~/${REMOTE_DIR}/.env"
  ssh -i "$SSH_KEY_PATH" -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
    "$SSH_USER@$SERVER_IP" "chmod 600 \"\$HOME/${REMOTE_DIR}/.env\""
fi

echo "==> rsync api/ + compose file (excludes node_modules, .env)"
rsync -avz --delete \
  -e "$RSYNC_RSH" \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '*.log' \
  --exclude 'uploads/*' \
  "$LOCAL_ROOT/api/" "$REMOTE/api/"

rsync -avz \
  -e "$RSYNC_RSH" \
  "$LOCAL_ROOT/$COMPOSE_FILE" "$REMOTE$COMPOSE_FILE"

ssh -i "$SSH_KEY_PATH" -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$SSH_USER@$SERVER_IP" \
  REMOTE_DIR="$REMOTE_DIR" COMPOSE_FILE="$COMPOSE_FILE" BUILD_NO_CACHE="$BUILD_NO_CACHE" \
  RUN_TMIG="${DEPLOY_RUN_TELEMEDICINE_MIGRATIONS:-}" \
  bash -s <<'REMOTE'
set -euo pipefail
cd "$HOME/${REMOTE_DIR}"
if [[ ! -f .env ]]; then
  echo "ERROR: missing .env in $HOME/${REMOTE_DIR} (create on server; see deploy-api-shared-mysql.sh header)." >&2
  exit 1
fi
# shellcheck disable=SC2086
docker compose -f "${COMPOSE_FILE}" --env-file .env build ${BUILD_NO_CACHE}
docker compose -f "${COMPOSE_FILE}" --env-file .env up -d

if [[ "${RUN_TMIG}" == "1" ]]; then
  echo "==> Running telemedicine DB migrations in kiplombe_api..."
  docker exec kiplombe_api npm run migrate:telemedicine || {
    echo "WARN: migrate:telemedicine failed (already migrated or DB error). Check logs." >&2
  }
fi

docker compose -f "${COMPOSE_FILE}" ps
REMOTE

echo "==> Done. Test: curl -sS http://${SERVER_IP}:3001/ | head -c 200"
echo "    Ensure static site was built with NEXT_PUBLIC_API_URL=https://${SERVER_IP}:3001 (or your public API URL + HTTPS)."
