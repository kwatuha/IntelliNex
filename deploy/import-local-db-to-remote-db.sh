#!/usr/bin/env bash
# =============================================================================
# Dump MySQL from local Docker (e.g. kiplombe_mysql) → restore into remote DB name
# =============================================================================
#
# Use when the remote database already exists (e.g. intellinex_hmis_db) but is empty,
# and you want a copy of your local HMIS schema + data from kiplombe_hmis (or another name).
#
# Requirements:
#   • Local: mysql container running (default name kiplombe_mysql from docker-compose.yml)
#   • Remote: MySQL container running (default name db), root password known
#   • Remote target database and app user already created (GRANT … ON target_db.* …)
#
# Usage (from repo root):
#   ./deploy/import-local-db-to-remote-db.sh
#
# Remote MySQL root password is read from (first match wins):
#   • env REMOTE_MYSQL_ROOT_PASSWORD
#   • deploy/.env.api-server (recommended — same file as API deploy; add REMOTE_MYSQL_ROOT_PASSWORD=…)
#   • repo .env: REMOTE_MYSQL_ROOT_PASSWORD or REMOTE_DB_ROOT_PASSWORD or MYSQL_ROOT_PASSWORD
#
# Override with env (examples):
#   LOCAL_SOURCE_DB=kiplombe_hmis REMOTE_TARGET_DB=intellinex_hmis_db \
#   REMOTE_MYSQL_ROOT_PASSWORD=… ./deploy/import-local-db-to-remote-db.sh
#
# Local root password: MYSQL_ROOT_PASSWORD from .env or "root_password".
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
if [[ -f "$REPO_ROOT/deploy/.env.api-server" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/deploy/.env.api-server"
  set +a
fi

LOCAL_MYSQL_CONTAINER="${LOCAL_MYSQL_CONTAINER:-}"
if [[ -z "$LOCAL_MYSQL_CONTAINER" ]]; then
  LOCAL_MYSQL_CONTAINER=$(docker ps --format "{{.Names}}" | grep -E '^kiplombe_mysql$|^kiplombe_mysql_prod$' | head -1 || true)
fi
if [[ -z "$LOCAL_MYSQL_CONTAINER" ]]; then
  LOCAL_MYSQL_CONTAINER=$(docker ps --format "{{.Names}}" | grep -i mysql | head -1 || true)
fi
if [[ -z "$LOCAL_MYSQL_CONTAINER" ]]; then
  echo "ERROR: No local MySQL container found. Start one (e.g. docker compose up -d mysql_db) or set LOCAL_MYSQL_CONTAINER." >&2
  exit 1
fi

LOCAL_SOURCE_DB="${LOCAL_SOURCE_DB:-${MYSQL_DATABASE:-kiplombe_hmis}}"
LOCAL_ROOT_PASS="${LOCAL_MYSQL_ROOT_PASSWORD:-${MYSQL_ROOT_PASSWORD:-root_password}}"

REMOTE_HOST="${REMOTE_HOST:-${SERVER_IP:-165.22.227.234}}"
REMOTE_SSH_USER="${REMOTE_SSH_USER:-${SSH_USER:-kunye}}"
REMOTE_SSH_KEY="${REMOTE_SSH_KEY:-${SSH_KEY_PATH:-$HOME/.ssh/id_asusme}}"
REMOTE_SSH_KEY="${REMOTE_SSH_KEY/#\~/$HOME}"

REMOTE_MYSQL_CONTAINER="${REMOTE_MYSQL_CONTAINER:-db}"
REMOTE_TARGET_DB="${REMOTE_TARGET_DB:-intellinex_hmis_db}"
REMOTE_MYSQL_ROOT_PASSWORD="${REMOTE_MYSQL_ROOT_PASSWORD:-${REMOTE_DB_ROOT_PASSWORD:-${MYSQL_ROOT_PASSWORD:-}}}"

if [[ -z "$REMOTE_MYSQL_ROOT_PASSWORD" ]]; then
  echo "ERROR: Need the MySQL root password for remote container \"${REMOTE_MYSQL_CONTAINER}\"." >&2
  echo "  Add to deploy/.env.api-server (see deploy/env.api-server.example):" >&2
  echo "    REMOTE_MYSQL_ROOT_PASSWORD=your_root_password" >&2
  echo "  Or run once: REMOTE_MYSQL_ROOT_PASSWORD='…' $0" >&2
  exit 1
fi

DUMP_TMP="$(mktemp)"
trap 'rm -f "$DUMP_TMP" "$DUMP_TMP.gz"' EXIT

echo "==> Local container:  $LOCAL_MYSQL_CONTAINER"
echo "==> Source database:  $LOCAL_SOURCE_DB"
echo "==> Remote:           ${REMOTE_SSH_USER}@${REMOTE_HOST}"
echo "==> Remote container: $REMOTE_MYSQL_CONTAINER"
echo "==> Target database:  $REMOTE_TARGET_DB"
echo ""

echo "==> Dumping local database (no --databases, so we can import into a differently named DB on remote)…"
if ! docker exec "$LOCAL_MYSQL_CONTAINER" mysqladmin ping -h localhost -uroot -p"$LOCAL_ROOT_PASS" --silent 2>/dev/null; then
  echo "ERROR: cannot ping MySQL as root on local container. Check LOCAL_MYSQL_ROOT_PASSWORD / MYSQL_ROOT_PASSWORD." >&2
  exit 1
fi

docker exec "$LOCAL_MYSQL_CONTAINER" mysqldump \
  -uroot -p"$LOCAL_ROOT_PASS" \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --set-gtid-purged=OFF \
  --databases "$LOCAL_SOURCE_DB" 2>/dev/null | \
{
  if [[ "$LOCAL_SOURCE_DB" != "$REMOTE_TARGET_DB" ]]; then
    # Rewrite identifier so restore creates objects in the target database name.
    sed -e "s/\`${LOCAL_SOURCE_DB}\`/\`${REMOTE_TARGET_DB}\`/g"
  else
    cat
  fi
} > "$DUMP_TMP"

if [[ ! -s "$DUMP_TMP" ]]; then
  echo "ERROR: dump is empty or mysqldump failed (wrong password or database missing?)." >&2
  exit 1
fi

{ echo "SET FOREIGN_KEY_CHECKS=0; SET NAMES utf8mb4;"; cat "$DUMP_TMP"; echo "SET FOREIGN_KEY_CHECKS=1;"; } | gzip -c > "$DUMP_TMP.gz"
DUMP_SIZE=$(du -h "$DUMP_TMP.gz" | cut -f1)
echo "==> Compressed dump: $DUMP_SIZE"
echo ""

REMOTE_DUMP="/tmp/intellinex_hmis_import_$(date +%Y%m%d%H%M%S).sql.gz"
echo "==> Uploading → ${REMOTE_SSH_USER}@${REMOTE_HOST}:${REMOTE_DUMP}"
scp -i "$REMOTE_SSH_KEY" -o StrictHostKeyChecking=accept-new \
  "$DUMP_TMP.gz" "${REMOTE_SSH_USER}@${REMOTE_HOST}:${REMOTE_DUMP}"

echo "==> Restoring on remote into database \`${REMOTE_TARGET_DB}\` (pipe into mysql client)…"
# shellcheck disable=SC2029
ssh -i "$REMOTE_SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
  "${REMOTE_SSH_USER}@${REMOTE_HOST}" \
  env REMOTE_DUMP="$REMOTE_DUMP" CONT="$REMOTE_MYSQL_CONTAINER" \
  ROOT_PASS="$REMOTE_MYSQL_ROOT_PASSWORD" TARGET_DB="$REMOTE_TARGET_DB" bash -s <<'EOS'
set -euo pipefail
until docker exec "$CONT" mysqladmin ping -h localhost -uroot -p"$ROOT_PASS" --silent 2>/dev/null; do
  echo "Waiting for MySQL..."
  sleep 2
done
gunzip -c "$REMOTE_DUMP" | docker exec -i "$CONT" mysql -uroot -p"$ROOT_PASS"
rm -f "$REMOTE_DUMP"
TABLES=$(docker exec "$CONT" mysql -uroot -p"$ROOT_PASS" -N -e \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${TARGET_DB}';" 2>/dev/null || echo "0")
echo "Remote table count in ${TARGET_DB}: ${TABLES}"
EOS

echo ""
echo "Done. Ensure deploy/.env.api-server uses DB_NAME=${REMOTE_TARGET_DB} (and matching DB_USER grants on that schema)."
