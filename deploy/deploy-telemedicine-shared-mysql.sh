#!/usr/bin/env bash
# =============================================================================
# Deploy telemedicine showcase stack (frontend + API) on shared host MySQL
# Compose: docker-compose.telemedicine-shared-mysql.yml
# Containers: telemed_api, telemed_frontend (does NOT touch kiplombe_* / main HMIS)
# =============================================================================
#
# Prerequisites:
#   1) Shared MySQL network reachable (EXTERNAL_MYSQL_DOCKER_NETWORK)
#   2) Dedicated DB + user created (./deploy/setup-telemedicine-db-remote.sh)
#   3) deploy/.env.telemedicine filled in (from env.telemedicine.example)
#
# Usage:
#   LOCAL_ENV_FILE=./deploy/.env.telemedicine \
#     ./deploy/deploy-telemedicine-shared-mysql.sh [SERVER_IP] [SSH_KEY_PATH]
#
# Optional:
#   REMOTE_DIR=intellinex-telemed
#   DEPLOY_USE_DOCKER_CACHE=1
#   DEPLOY_RUN_TELEMEDICINE_MIGRATIONS=1   # schema + telemedicine_clinician
#   DEPLOY_RUN_SHOWCASE_PACK=1            # hide non-telemedicine menus on clinical roles
#
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  sed -n '1,40p' "$0"
  exit 0
fi

SERVER_IP="${SERVER_IP:-165.22.227.234}"
SSH_USER="${SSH_USER:-kunye}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/id_asusme}"
REMOTE_DIR="${REMOTE_DIR:-intellinex-telemed}"
COMPOSE_FILE="docker-compose.telemedicine-shared-mysql.yml"

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
echo "==> Note:       leaves main HMIS (kiplombe_* / intellinex-full) running"

if [[ ! -f "$LOCAL_ROOT/$COMPOSE_FILE" ]]; then
  echo "ERROR: $COMPOSE_FILE not found." >&2
  exit 1
fi

echo "==> Ensure remote directory exists: ~/${REMOTE_DIR}/"
ssh -i "$SSH_KEY_PATH" -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
  "$SSH_USER@$SERVER_IP" "mkdir -p \"\$HOME/${REMOTE_DIR}\" \"\$HOME/${REMOTE_DIR}/deploy\""

if [[ -z "${LOCAL_ENV_FILE:-}" && -f "$LOCAL_ROOT/deploy/.env.telemedicine" ]]; then
  LOCAL_ENV_FILE="deploy/.env.telemedicine"
  echo "==> Using default env file: deploy/.env.telemedicine"
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
  echo "==> scp .env → ${SSH_USER}@${SERVER_IP}:~/${REMOTE_DIR}/.env"
  scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=accept-new \
    "$ENV_SRC" "${SSH_USER}@${SERVER_IP}:~/${REMOTE_DIR}/.env"
  ssh -i "$SSH_KEY_PATH" -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
    "$SSH_USER@$SERVER_IP" "chmod 600 \"\$HOME/${REMOTE_DIR}/.env\""
fi

echo "==> rsync project files"
rsync -avz --delete \
  -e "$RSYNC_RSH" \
  --exclude '.git' \
  --exclude '.next' \
  --exclude 'out' \
  --exclude 'node_modules' \
  --exclude 'api/node_modules' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'deploy/ssl/*.pem' \
  --exclude 'deploy/ssl/*.key' \
  --exclude 'deploy/ssl-telemed/*.pem' \
  --exclude 'deploy/ssl-telemed/*.key' \
  --exclude '*.log' \
  --exclude 'backups' \
  "$LOCAL_ROOT/" "$REMOTE"

ssh -i "$SSH_KEY_PATH" -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$SSH_USER@$SERVER_IP" \
  REMOTE_DIR="$REMOTE_DIR" COMPOSE_FILE="$COMPOSE_FILE" BUILD_NO_CACHE="$BUILD_NO_CACHE" \
  RUN_TMIG="${DEPLOY_RUN_TELEMEDICINE_MIGRATIONS:-1}" \
  RUN_SHOWCASE="${DEPLOY_RUN_SHOWCASE_PACK:-1}" \
  bash -s <<'REMOTE'
set -euo pipefail

cd "$HOME/${REMOTE_DIR}"

if [[ ! -f .env ]]; then
  echo "ERROR: missing .env in $HOME/${REMOTE_DIR}" >&2
  echo "  Copy deploy/env.telemedicine.example → deploy/.env.telemedicine and redeploy." >&2
  exit 1
fi

# Only reconcile telemed_* containers (never kiplombe_*)
echo "==> Reconciling telemed_* containers..."
for _cname in telemed_api telemed_frontend telemed_hmis_https; do
  if ! docker inspect "$_cname" >/dev/null 2>&1; then
    continue
  fi
  _cf=$(docker inspect "$_cname" --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' 2>/dev/null || echo "")
  if echo "$_cf" | grep -qF 'docker-compose.telemedicine-shared-mysql.yml'; then
    echo "==> Removing ${_cname} (previous telemed deploy; compose will recreate)"
    docker rm -f "$_cname" || true
  fi
done

# shellcheck disable=SC2086
docker compose -f "${COMPOSE_FILE}" --env-file .env build ${BUILD_NO_CACHE}
docker compose -f "${COMPOSE_FILE}" --env-file .env up -d

if [[ "${RUN_TMIG}" == "1" ]]; then
  echo "==> Running telemedicine DB migrations in telemed_api..."
  docker exec telemed_api npm run migrate:telemedicine || {
    echo "WARN: migrate:telemedicine failed (already migrated or DB error). Check logs." >&2
  }
fi

if [[ "${RUN_SHOWCASE}" == "1" ]]; then
  echo "==> Applying telemedicine showcase pack (hide non-TM menus)..."
  docker exec telemed_api npm run migrate:telemedicine-showcase || {
    echo "WARN: showcase pack failed. Check logs." >&2
  }
fi

docker compose -f "${COMPOSE_FILE}" ps
REMOTE

# shellcheck disable=SC1090
API_PORT_HINT=3011
HMIS_PORT_HINT=3112
if [[ -n "${LOCAL_ENV_FILE:-}" ]]; then
  ENV_SRC="$LOCAL_ENV_FILE"
  [[ "$ENV_SRC" != /* ]] && ENV_SRC="$LOCAL_ROOT/$ENV_SRC"
  if [[ -f "$ENV_SRC" ]]; then
    API_PORT_HINT=$(grep -E '^API_PORT=' "$ENV_SRC" | head -1 | cut -d= -f2- || echo 3011)
    HMIS_PORT_HINT=$(grep -E '^HMIS_FRONTEND_PORT=' "$ENV_SRC" | head -1 | cut -d= -f2- || echo 3112)
  fi
fi

echo "==> Done (telemedicine showcase)."
echo "    UI:  http://${SERVER_IP}:${HMIS_PORT_HINT}/hmis/"
echo "    API: http://${SERVER_IP}:${API_PORT_HINT}/"
echo "    Main HMIS stack was not stopped."
