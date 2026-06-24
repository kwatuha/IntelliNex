#!/usr/bin/env bash
# =============================================================================
# Extend expired drug_inventory expiry dates by 16 months (test data) on REMOTE
# =============================================================================
# Usage:
#   chmod +x deploy/run-extend-expired-drugs-remote.sh
#   SERVER_IP=165.22.227.234 SSH_USER=kunye SSH_KEY_PATH=~/.ssh/id_asusme \
#     ./deploy/run-extend-expired-drugs-remote.sh
#
# Local Docker:
#   ./deploy/run-extend-expired-drugs-remote.sh --local
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SQL_FILE="$REPO_ROOT/api/database/migrations/61_extend_expired_test_drug_expiry.sql"

if [[ ! -f "$SQL_FILE" ]]; then
  echo "❌ Missing: $SQL_FILE"
  exit 1
fi

run_mysql() {
  local container="$1" user="$2" pass="$3" db="$4"
  echo "==> Preview: expired active batches before update"
  docker exec "$container" mysql -u"$user" -p"$pass" "$db" -e "
    SELECT COUNT(*) AS expired_batch_count,
           COALESCE(SUM(quantity), 0) AS total_units
    FROM drug_inventory
    WHERE expiryDate IS NOT NULL
      AND expiryDate < CURDATE()
      AND COALESCE(quantity, 0) > 0
      AND COALESCE(status, 'active') = 'active';
  " 2>/dev/null

  echo "==> Applying: +16 months to expired batch expiry dates"
  docker exec -i "$container" mysql -u"$user" -p"$pass" "$db" < "$SQL_FILE" 2>/dev/null

  echo "==> After update"
  docker exec "$container" mysql -u"$user" -p"$pass" "$db" -e "
    SELECT COUNT(*) AS still_expired_batches
    FROM drug_inventory
    WHERE expiryDate IS NOT NULL
      AND expiryDate < CURDATE()
      AND COALESCE(quantity, 0) > 0
      AND COALESCE(status, 'active') = 'active';
    SELECT di.medicationId, m.name, di.batchNumber, di.quantity, di.expiryDate
    FROM drug_inventory di
    LEFT JOIN medications m ON di.medicationId = m.medicationId
    WHERE COALESCE(di.quantity, 0) > 0
      AND COALESCE(di.status, 'active') = 'active'
      AND (di.expiryDate IS NULL OR di.expiryDate >= CURDATE())
    ORDER BY m.name, di.expiryDate
    LIMIT 20;
  " 2>/dev/null
}

if [[ "${1:-}" == "--local" ]]; then
  cd "$REPO_ROOT"
  if [[ -f .env ]]; then
    set -a
    # shellcheck disable=SC1091
    . ./.env
    set +a
  fi
  CONTAINER="${MYSQL_CONTAINER:-intellinex_mysql}"
  DB_NAME="${DB_NAME:-${MYSQL_DATABASE:-intellinex_hmis}}"
  DB_USER="${DB_USER:-${MYSQL_USER:-root}}"
  DB_PASSWORD="${DB_PASSWORD:-${MYSQL_ROOT_PASSWORD:-root}}"
  echo "Local MySQL container: $CONTAINER  database: $DB_NAME"
  run_mysql "$CONTAINER" "$DB_USER" "$DB_PASSWORD" "$DB_NAME"
  exit 0
fi

SERVER_IP="${SERVER_IP:-165.22.227.234}"
SSH_USER="${SSH_USER:-kunye}"
SSH_KEY_PATH="${SSH_KEY_PATH:-~/.ssh/id_asusme}"
SSH_KEY_PATH="${SSH_KEY_PATH/#\~/$HOME}"
REMOTE_ENV_DIR="${REMOTE_ENV_DIR:-intellinex-full}"
MYSQL_CONTAINER="${MYSQL_CONTAINER:-db}"

if [[ ! -f "$SSH_KEY_PATH" ]]; then
  echo "❌ SSH key not found: $SSH_KEY_PATH"
  exit 1
fi

REMOTE_TMP="/tmp/intellinex_expiry_$(date +%s)"

echo "=============================================="
echo " Extend expired drug expiry (+16 months)"
echo "=============================================="
echo " Server: $SSH_USER@$SERVER_IP"
echo ""

scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no \
  "$SQL_FILE" "${SSH_USER}@${SERVER_IP}:${REMOTE_TMP}/61.sql"

# shellcheck disable=SC2029
ssh -q -T -o BatchMode=yes -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no \
  "${SSH_USER}@${SERVER_IP}" bash -s << REMOTE_EOF
set -euo pipefail
REMOTE_TMP="$REMOTE_TMP"
REMOTE_ENV_DIR="$REMOTE_ENV_DIR"
MYSQL_CONTAINER="$MYSQL_CONTAINER"

. "\$HOME/\$REMOTE_ENV_DIR/.env"
: "\${DB_NAME:?}" : "\${DB_USER:?}" : "\${DB_PASSWORD:?}"

C="\$(docker ps --format '{{.Names}}' | grep -E "^${MYSQL_CONTAINER}\$" | head -1)"
[ -n "\$C" ] || C="\$(docker ps --format '{{.Names}}' | grep -iE 'mysql|mariadb|^db\$' | head -1)"
echo "container: \$C  database: \$DB_NAME"

echo "==> Preview: expired active batches before update"
docker exec "\$C" mysql -u"\$DB_USER" -p"\$DB_PASSWORD" "\$DB_NAME" -e "
  SELECT COUNT(*) AS expired_batch_count,
         COALESCE(SUM(quantity), 0) AS total_units
  FROM drug_inventory
  WHERE expiryDate IS NOT NULL
    AND expiryDate < CURDATE()
    AND COALESCE(quantity, 0) > 0
    AND COALESCE(status, 'active') = 'active';
" 2>/dev/null

echo "==> Applying: +16 months"
docker exec -i "\$C" mysql -u"\$DB_USER" -p"\$DB_PASSWORD" "\$DB_NAME" < "\$REMOTE_TMP/61.sql" 2>/dev/null

echo "==> After update"
docker exec "\$C" mysql -u"\$DB_USER" -p"\$DB_PASSWORD" "\$DB_NAME" -e "
  SELECT COUNT(*) AS still_expired_batches
  FROM drug_inventory
  WHERE expiryDate IS NOT NULL
    AND expiryDate < CURDATE()
    AND COALESCE(quantity, 0) > 0
    AND COALESCE(status, 'active') = 'active';
" 2>/dev/null

rm -rf "\$REMOTE_TMP"
REMOTE_EOF

echo ""
echo "✅ Done. Re-test chemist dispatch batch dropdown on remote."
