#!/usr/bin/env bash
# Copy MySQL data from the Kiplombe Docker container into IntelliNex's MySQL container.
# Same schema and data; IntelliNex uses DB name "intellinex" and its own credentials for the app.
#
# Prerequisites:
#   - kiplombe_mysql is running (Kiplombe project: docker compose up -d mysql_db)
#   - intellinex_mysql is running (this project: docker compose up -d mysql_db)
#
# Usage:
#   ./scripts/copy-kiplombe-db-to-intellinex.sh
#
# Kiplombe Docker MySQL container name is kiplombe_mysql (from Kiplombe docker-compose).
#
# Optional env (defaults match typical local dev compose files):
#   SOURCE_CONTAINER=kiplombe_mysql   # must match Kiplombe's container_name
#   SOURCE_DB=kiplombe_hmis
#   SOURCE_ROOT_PASSWORD / KIPLOMBE_MYSQL_ROOT_PASSWORD=root_password  # Kiplombe MySQL root (do not use IntelliNex MYSQL_ROOT_* for source)
#   TARGET_CONTAINER=intellinex_mysql
#   TARGET_DB=intellinex
#   TARGET_ROOT_PASSWORD=root_password
#   TARGET_APP_USER=intellinex_user
#   TARGET_APP_PASSWORD=intellinex_password

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f .env ]; then
  # shellcheck disable=SC2046
  export $(grep -v '^\s*#' .env | grep -v '^\s*$' | xargs) 2>/dev/null || true
fi

# Source: always kiplombe_mysql unless you override (e.g. remote Docker name).
SOURCE_CONTAINER="${SOURCE_CONTAINER:-kiplombe_mysql}"
SOURCE_DB="${SOURCE_DB:-kiplombe_hmis}"
# Root password for *Kiplombe* MySQL only — not MYSQL_ROOT_PASSWORD from this repo's .env (that may target IntelliNex).
SOURCE_ROOT_PASSWORD="${SOURCE_ROOT_PASSWORD:-${KIPLOMBE_MYSQL_ROOT_PASSWORD:-root_password}}"

TARGET_CONTAINER="${TARGET_CONTAINER:-intellinex_mysql}"
TARGET_DB="${TARGET_DB:-intellinex}"
TARGET_ROOT_PASSWORD="${TARGET_ROOT_PASSWORD:-root_password}"
TARGET_APP_USER="${TARGET_APP_USER:-intellinex_user}"
TARGET_APP_PASSWORD="${TARGET_APP_PASSWORD:-intellinex_password}"

die() { echo "ERROR: $*" >&2; exit 1; }

command -v docker >/dev/null || die "docker not found"

docker ps --format '{{.Names}}' | grep -qx "$SOURCE_CONTAINER" || die "Source container not running: $SOURCE_CONTAINER (expected Kiplombe: kiplombe_mysql — start Kiplombe: docker compose up -d mysql_db)"
docker ps --format '{{.Names}}' | grep -qx "$TARGET_CONTAINER" || die "Target container not running: $TARGET_CONTAINER (run: docker compose up -d mysql_db)"

echo "==> Source: container=${SOURCE_CONTAINER} database=${SOURCE_DB}"
echo "==> Dumping ${SOURCE_DB} from ${SOURCE_CONTAINER} ..."

mysqldump_from_source() {
  if docker exec -e MYSQL_PWD="$SOURCE_ROOT_PASSWORD" "$SOURCE_CONTAINER" \
    mysqldump -u root \
    --single-transaction \
    --routines \
    --triggers \
    --events \
    --add-drop-database \
    --databases "$SOURCE_DB" \
    --set-gtid-purged=OFF 2>/dev/null; then
    return 0
  fi
  echo "WARN: root dump failed; trying Kiplombe app user (set KIPLOMBE_MYSQL_USER / KIPLOMBE_MYSQL_PASSWORD if needed)." >&2
  KIPLOMBE_USER="${KIPLOMBE_MYSQL_USER:-${MYSQL_USER:-kiplombe_user}}"
  KIPLOMBE_PASS="${KIPLOMBE_MYSQL_PASSWORD:-${MYSQL_PASSWORD:-kiplombe_password}}"
  docker exec -e MYSQL_PWD="$KIPLOMBE_PASS" "$SOURCE_CONTAINER" \
    mysqldump -u "$KIPLOMBE_USER" \
    --single-transaction \
    --routines \
    --triggers \
    --events \
    --add-drop-database \
    --databases "$SOURCE_DB" \
    --set-gtid-purged=OFF
}

# Map source DB name -> target DB name in the dump (CREATE DATABASE, USE, DROP, etc.)
rewrite_db_name() {
  sed "s/\`${SOURCE_DB}\`/\`${TARGET_DB}\`/g" | sed "s/${SOURCE_DB}/${TARGET_DB}/g"
}

echo "==> Importing into ${TARGET_CONTAINER} as database ${TARGET_DB} ..."

{
  echo "SET FOREIGN_KEY_CHECKS=0;"
  echo "SET NAMES utf8mb4;"
  mysqldump_from_source
} | rewrite_db_name | docker exec -i -e MYSQL_PWD="$TARGET_ROOT_PASSWORD" "$TARGET_CONTAINER" mysql -u root

echo "==> Ensuring app user can access ${TARGET_DB} ..."

docker exec -e MYSQL_PWD="$TARGET_ROOT_PASSWORD" "$TARGET_CONTAINER" mysql -u root -e "
CREATE USER IF NOT EXISTS '${TARGET_APP_USER}'@'%' IDENTIFIED BY '${TARGET_APP_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${TARGET_DB}\`.* TO '${TARGET_APP_USER}'@'%';
FLUSH PRIVILEGES;
" || true

echo "Done. IntelliNex API should use DB_NAME=${TARGET_DB} (already set in docker-compose.yml)."
echo "Restart API if it was running: docker compose restart api"
