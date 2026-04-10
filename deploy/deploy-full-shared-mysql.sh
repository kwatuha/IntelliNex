#!/usr/bin/env bash
# =============================================================================
# Deploy full HMIS stack (frontend + API + nginx) using shared host MySQL
# Compose file: docker-compose.shared-mysql.yml
# =============================================================================
#
# Use this when you want BOTH frontend and API on the same VPS/domain to avoid
# cross-origin / mixed-content issues.
#
# Typical server layout:
#   ~/intellinex-full/
#     - docker-compose.shared-mysql.yml
#     - .env
#     - app source + api source + deploy/nginx.conf
#
# Usage:
#   ./deploy/deploy-full-shared-mysql.sh [SERVER_IP] [SSH_KEY_PATH]
#   SERVER_IP=165.22.227.234 SSH_USER=kunye SSH_KEY_PATH=~/.ssh/id_asusme \
#     ./deploy/deploy-full-shared-mysql.sh
#
# Optional:
#   LOCAL_ENV_FILE=./deploy/.env.api-server   # copied to remote .env
#   REMOTE_DIR=intellinex-full                # remote directory under $HOME
#   API_ONLY_REMOTE_DIR=intellinex-api        # where API-only compose lived (docker-compose.shared-mysql-api-only.yml)
#   SKIP_API_ONLY_TEARDOWN=1                  # skip stopping API-only stack (not recommended if names conflict)
#   Keep COMPOSE_PROJECT_NAME in remote .env stable (e.g. intellinex-full) — changing it orphans old kiplombe_*;
#   this script removes full-stack orphans before up; API-only teardown is still run first.
#   DEPLOY_USE_DOCKER_CACHE=1                 # omit --no-cache on build
#   DEPLOY_RUN_TELEMEDICINE_MIGRATIONS=1      # run migrations in kiplombe_api
#
# Required .env values (remote):
#   EXTERNAL_MYSQL_DOCKER_NETWORK=projects_default
#   DB_HOST=db
#   DB_PORT=3306
#   DB_USER=...
#   DB_PASSWORD=...
#   DB_NAME=...
#   FRONTEND_URL=https://your-server-origin
#   NEXT_PUBLIC_BASE_URL=https://your-server-origin/hmis   (if served from /hmis)
#   NEXT_PUBLIC_API_URL=                                   (empty for same-origin /api)
#
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  sed -n '1,70p' "$0"
  exit 0
fi

SERVER_IP="${SERVER_IP:-165.22.227.234}"
SSH_USER="${SSH_USER:-kunye}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/id_asusme}"
REMOTE_DIR="${REMOTE_DIR:-intellinex-full}"
COMPOSE_FILE="docker-compose.shared-mysql.yml"

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

if [[ ! -f "$LOCAL_ROOT/$COMPOSE_FILE" ]]; then
  echo "ERROR: $COMPOSE_FILE not found." >&2
  exit 1
fi

if [[ ! -f "$LOCAL_ROOT/Dockerfile.prod" ]]; then
  echo "ERROR: Dockerfile.prod not found in repo root." >&2
  exit 1
fi

echo "==> Ensure remote directory exists: ~/${REMOTE_DIR}/"
ssh -i "$SSH_KEY_PATH" -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
  "$SSH_USER@$SERVER_IP" "mkdir -p \"\$HOME/${REMOTE_DIR}\" \"\$HOME/${REMOTE_DIR}/deploy\""

# Auto-use deploy/.env.api-server when present (works for demo/full stack too).
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

echo "==> rsync project files (excluding heavy/build/secrets)"
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
  --exclude '*.log' \
  --exclude 'backups' \
  "$LOCAL_ROOT/" "$REMOTE"

ssh -i "$SSH_KEY_PATH" -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$SSH_USER@$SERVER_IP" \
  REMOTE_DIR="$REMOTE_DIR" COMPOSE_FILE="$COMPOSE_FILE" BUILD_NO_CACHE="$BUILD_NO_CACHE" \
  RUN_TMIG="${DEPLOY_RUN_TELEMEDICINE_MIGRATIONS:-}" \
  API_ONLY_REMOTE_DIR="${API_ONLY_REMOTE_DIR:-intellinex-api}" \
  SKIP_API_ONLY_TEARDOWN="${SKIP_API_ONLY_TEARDOWN:-}" \
  bash -s <<'REMOTE'
set -euo pipefail

# API-only and full stack both use fixed container names (e.g. kiplombe_api). Tear down API-only first.
API_ONLY_COMPOSE="docker-compose.shared-mysql-api-only.yml"
if [[ "${SKIP_API_ONLY_TEARDOWN:-}" == "1" ]]; then
  echo "==> SKIP_API_ONLY_TEARDOWN=1 — skipping API-only stack teardown (may hit name conflicts)."
else
  echo "==> Stopping API-only stack if present (frees kiplombe_api / kiplombe_api_nginx for full deploy)..."
  _api_only_home="$HOME/${API_ONLY_REMOTE_DIR}"
  if [[ -f "${_api_only_home}/${API_ONLY_COMPOSE}" ]]; then
    if [[ -f "${_api_only_home}/.env" ]]; then
      (cd "${_api_only_home}" && docker compose -f "${API_ONLY_COMPOSE}" --env-file .env down --remove-orphans) \
        || true
    else
      (cd "${_api_only_home}" && docker compose -f "${API_ONLY_COMPOSE}" down --remove-orphans) \
        || true
    fi
  else
    echo "    (no ${_api_only_home}/${API_ONLY_COMPOSE} — nothing to compose down)"
  fi
  # Only remove orphans still labeled as API-only compose (do not rm full-stack kiplombe_api).
  for _cname in kiplombe_api kiplombe_api_nginx; do
    if ! docker inspect "$_cname" >/dev/null 2>&1; then
      continue
    fi
    _cf=$(docker inspect "$_cname" --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' 2>/dev/null || echo "")
    if echo "$_cf" | grep -qF 'shared-mysql-api-only'; then
      echo "==> Removing leftover ${_cname} (still labeled API-only compose)"
      docker rm -f "$_cname" || true
    else
      echo "    Leaving ${_cname} (not API-only compose — full stack or manual)"
    fi
  done
fi

cd "$HOME/${REMOTE_DIR}"

if [[ ! -f .env ]]; then
  echo "ERROR: missing .env in $HOME/${REMOTE_DIR}" >&2
  exit 1
fi

# Fixed container names (kiplombe_*): if COMPOSE_PROJECT_NAME changed, "compose up" tries to CREATE new
# containers instead of adopting old ones → name conflict. Remove prior full-stack instances only.
echo "==> Reconciling full-stack containers (avoid duplicate kiplombe_* after project name change)..."
for _cname in kiplombe_api kiplombe_frontend; do
  if ! docker inspect "$_cname" >/dev/null 2>&1; then
    continue
  fi
  _cf=$(docker inspect "$_cname" --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' 2>/dev/null || echo "")
  # Full stack uses .../docker-compose.shared-mysql.yml (not .../docker-compose.shared-mysql-api-only.yml).
  if echo "$_cf" | grep -qF 'docker-compose.shared-mysql.yml' && ! echo "$_cf" | grep -qF 'shared-mysql-api-only'; then
    echo "==> Removing ${_cname} (previous full-stack deploy; compose will recreate)"
    docker rm -f "$_cname" || true
  fi
done

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

echo "==> Done."
echo "    (docker-compose.shared-mysql.yml has no bundled nginx — use host ports below.)"
echo "    HMIS UI (basePath /hmis): http://${SERVER_IP}:${HMIS_FRONTEND_PORT:-3102}/hmis/"
echo "    API direct:               http://${SERVER_IP}:${API_PORT:-3001}/"
echo "    Health check from laptop: SERVER_IP=${SERVER_IP} ./deploy/verify-remote-hmis.sh"
echo "    Open TCP ${HMIS_FRONTEND_PORT:-3102} in the cloud firewall + ufw if the UI is not reachable from the internet."
