#!/usr/bin/env bash
# Apply telemedicine schema + experience-pack role migrations inside the MySQL Docker container.
#
# Usage (from repo root or api/):
#   bash api/scripts/run-telemedicine-migration-docker.sh
#
# Override defaults:
#   MYSQL_CONTAINER=kiplombe_mysql MYSQL_USER=... MYSQL_PASSWORD=... MYSQL_DATABASE=... bash api/scripts/run-telemedicine-migration-docker.sh
#
# Use MySQL root (same as: mysql -uroot -proot_password) for local docker-compose:
#   MYSQL_TELEMEDICINE_USE_ROOT=1 MYSQL_ROOT_PASSWORD=root_password bash api/scripts/run-telemedicine-migration-docker.sh

set -euo pipefail

CONTAINER_NAME="${MYSQL_CONTAINER:-kiplombe_mysql}"
DB_NAME="${MYSQL_DATABASE:-kiplombe_hmis}"
DB_USER="${MYSQL_USER:-kiplombe_user}"
DB_PASSWORD="${MYSQL_PASSWORD:-kiplombe_password}"
# Match local docker-compose root (optional): MYSQL_TELEMEDICINE_USE_ROOT=1 MYSQL_ROOT_PASSWORD=root_password
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-root_password}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/../database/migrations"

MIGRATIONS=(
  40_telemedicine_sessions_schema.sql
  41_telemedicine_zoom_manual.sql
  42_user_telemedicine_defaults.sql
  43_telemedicine_standalone_origin.sql
  43_telemedicine_queue_origin.sql
  49_telemedicine_video_providers.sql
  67_telemedicine_metrics.sql
  68_nurse_triage_telemedicine_menu.sql
  69_telemedicine_clinician_role.sql
)

for f in "${MIGRATIONS[@]}"; do
  if [[ ! -f "$MIGRATIONS_DIR/$f" ]]; then
    echo "❌ Missing SQL file: $MIGRATIONS_DIR/$f"
    exit 1
  fi
done

echo "Checking Docker container '$CONTAINER_NAME'..."
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}\$"; then
  # Fall back to common local compose name
  if docker ps --format '{{.Names}}' | grep -q "^intellinex_mysql\$"; then
    CONTAINER_NAME="intellinex_mysql"
    echo "   (using container $CONTAINER_NAME)"
  else
    echo "❌ Container '$CONTAINER_NAME' is not running."
    echo "   Start MySQL with: docker compose up -d mysql_db   (or docker-compose up -d mysql_db)"
    exit 1
  fi
fi

mysql_apply() {
  local sqlfile="$1"
  local label="$2"
  echo "✅ Running $label ..."
  if [ "${MYSQL_TELEMEDICINE_USE_ROOT:-}" = "1" ]; then
    docker exec -i "$CONTAINER_NAME" mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$DB_NAME" < "$sqlfile"
  else
    docker exec -i "$CONTAINER_NAME" mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$sqlfile"
  fi
}

for f in "${MIGRATIONS[@]}"; do
  mysql_apply "$MIGRATIONS_DIR/$f" "$f"
done

echo ""
echo "✅ Telemedicine migration finished (database: $DB_NAME) — schema + telemedicine_clinician role."
