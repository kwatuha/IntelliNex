#!/usr/bin/env bash
# =============================================================================
# Apply appointment daily limits (72) + Telemedicine department (73) on REMOTE MySQL.
# Does not need npm on the VPS — pipes SQL into the Docker MySQL container.
#
# From repo root (same host as full-stack deploy):
#   SERVER_IP=165.22.227.234 SSH_USER=kunye SSH_KEY_PATH=~/.ssh/id_asusme \
#     ./deploy/run-appointment-limits-migrations-remote.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

SERVER_IP="${SERVER_IP:-165.22.227.234}"
SSH_USER="${SSH_USER:-kunye}"
SSH_KEY_PATH="${SSH_KEY_PATH:-~/.ssh/id_asusme}"
SSH_KEY_PATH="${SSH_KEY_PATH/#\~/$HOME}"
REMOTE_ENV_DIR="${REMOTE_ENV_DIR:-intellinex-full}"
MYSQL_CONTAINER="${MYSQL_CONTAINER:-db}"

SQL72="$REPO_ROOT/api/database/migrations/72_appointment_daily_limits.sql"
SQL73="$REPO_ROOT/api/database/migrations/73_telemedicine_department.sql"

for f in "$SQL72" "$SQL73"; do
  if [[ ! -f "$f" ]]; then
    echo "Missing: $f"
    exit 1
  fi
done

if [[ ! -f "$SSH_KEY_PATH" ]]; then
  echo "SSH key not found: $SSH_KEY_PATH"
  exit 1
fi

REMOTE_TMP="/tmp/intellinex_apptlim_$(date +%s)"

echo "=============================================="
echo " Migrations 72–73 → remote MySQL (no npm)"
echo "=============================================="
echo " Server:    $SSH_USER@$SERVER_IP"
echo " Env dir:   ~/$REMOTE_ENV_DIR/.env"
echo " Key:       $SSH_KEY_PATH"
echo ""

SSH_OPTS=(
  -i "$SSH_KEY_PATH"
  -o BatchMode=yes
  -o StrictHostKeyChecking=no
  -o ConnectTimeout=20
  -o ServerAliveInterval=5
  -o ServerAliveCountMax=3
)

echo "==> SSH mkdir (times out after 20s if the VPS is unreachable)..."
ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SERVER_IP}" "mkdir -p $REMOTE_TMP"

echo "==> Uploading 72.sql and 73.sql..."
scp "${SSH_OPTS[@]}" \
  "$SQL72" "${SSH_USER}@${SERVER_IP}:${REMOTE_TMP}/72.sql"
scp "${SSH_OPTS[@]}" \
  "$SQL73" "${SSH_USER}@${SERVER_IP}:${REMOTE_TMP}/73.sql"

echo "==> Running SQL inside Docker MySQL..."
# shellcheck disable=SC2029
ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SERVER_IP}" bash -s << REMOTE_EOF
set -euo pipefail
REMOTE_TMP="$REMOTE_TMP"
MYSQL_CONTAINER="$MYSQL_CONTAINER"
REMOTE_ENV_DIR="$REMOTE_ENV_DIR"

if [ -f "\$HOME/\$REMOTE_ENV_DIR/.env" ]; then
  set -a
  . "\$HOME/\$REMOTE_ENV_DIR/.env"
  set +a
else
  echo "Missing ~/\$REMOTE_ENV_DIR/.env"
  exit 1
fi

: "\${DB_NAME:?DB_NAME not set in remote .env}"
: "\${DB_USER:?DB_USER not set in remote .env}"
: "\${DB_PASSWORD:?DB_PASSWORD not set in remote .env}"

C="\$(docker ps --format '{{.Names}}' | grep -E "^${MYSQL_CONTAINER}\$" | head -1)"
if [ -z "\$C" ]; then
  C="\$(docker ps --format '{{.Names}}' | grep -iE 'mysql|mariadb|^db\$' | head -1)"
fi
if [ -z "\$C" ]; then
  echo "No MySQL container found"
  exit 1
fi
echo "container: \$C  database: \$DB_NAME"

echo "==> 72_appointment_daily_limits.sql"
docker exec -i "\$C" mysql -u"\$DB_USER" -p"\$DB_PASSWORD" "\$DB_NAME" < "\$REMOTE_TMP/72.sql"

echo "==> 73_telemedicine_department.sql"
docker exec -i "\$C" mysql -u"\$DB_USER" -p"\$DB_PASSWORD" "\$DB_NAME" < "\$REMOTE_TMP/73.sql"

echo "==> Verify"
docker exec "\$C" mysql -u"\$DB_USER" -p"\$DB_PASSWORD" "\$DB_NAME" -N -e "
  SELECT 'appointment_daily_limits', COUNT(*) FROM information_schema.tables
    WHERE table_schema=DATABASE() AND table_name='appointment_daily_limits';
  SELECT departmentName FROM departments WHERE LOWER(TRIM(departmentName))='telemedicine';
"

rm -rf "\$REMOTE_TMP"
REMOTE_EOF

echo ""
echo "Done. Restart API if it is already running:"
echo "  ssh … 'cd ~/$REMOTE_ENV_DIR && docker compose -f docker-compose.shared-mysql.yml restart api'"
