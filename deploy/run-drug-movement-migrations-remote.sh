#!/usr/bin/env bash
# =============================================================================
# Run drug movement SQL migrations (58–60) on the REMOTE intellinex server
# =============================================================================
# 58 — chemist stock requests + store transfers tables
# 59 — pharmacy_notifications + reorder levels
# 60 — backfill drug_inventory.storeId from location (data fix, not schema)
#
# Prerequisites on remote (should already exist):
#   api/database/21_drug_stores_schema.sql  — drug_stores + drug_inventory.storeId column
#   api/database/22_update_drug_inventory_locations.sql — optional location text alignment
#   migrations 50–57 — external chemists (for chemist portal features)
#
# Usage (from repo root):
#   chmod +x deploy/run-drug-movement-migrations-remote.sh
#   SERVER_IP=165.22.227.234 SSH_USER=kunye SSH_KEY_PATH=~/.ssh/id_asusme \
#     ./deploy/run-drug-movement-migrations-remote.sh
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

SQL58="$REPO_ROOT/api/database/migrations/58_drug_movement.sql"
SQL59="$REPO_ROOT/api/database/migrations/59_pharmacy_notifications_reorder.sql"
SQL60="$REPO_ROOT/api/database/migrations/60_backfill_drug_inventory_store_id.sql"
SQL62="$REPO_ROOT/api/database/migrations/62_chemist_stock_requests_landing.sql"

for f in "$SQL58" "$SQL59" "$SQL60" "$SQL62"; do
  if [[ ! -f "$f" ]]; then
    echo "❌ Missing: $f"
    exit 1
  fi
done

if [[ ! -f "$SSH_KEY_PATH" ]]; then
  echo "❌ SSH key not found: $SSH_KEY_PATH"
  exit 1
fi

REMOTE_TMP="/tmp/intellinex_dmig_$(date +%s)"

echo "=============================================="
echo " Drug movement migrations 58–60 → REMOTE MySQL"
echo "=============================================="
echo " Server:    $SSH_USER@$SERVER_IP"
echo " Env dir:   ~/$REMOTE_ENV_DIR/.env"
echo " Container: $MYSQL_CONTAINER"
echo ""

echo "📤 Uploading SQL files..."
ssh -q -T -o BatchMode=yes -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no \
  "${SSH_USER}@${SERVER_IP}" "mkdir -p $REMOTE_TMP"

scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no \
  "$SQL58" "${SSH_USER}@${SERVER_IP}:${REMOTE_TMP}/58.sql"
scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no \
  "$SQL59" "${SSH_USER}@${SERVER_IP}:${REMOTE_TMP}/59.sql"
scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no \
  "$SQL60" "${SSH_USER}@${SERVER_IP}:${REMOTE_TMP}/60.sql"
scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no \
  "$SQL62" "${SSH_USER}@${SERVER_IP}:${REMOTE_TMP}/62.sql"

echo "📥 Running migrations on remote..."
# shellcheck disable=SC2029
ssh -q -T -o BatchMode=yes -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no \
  "${SSH_USER}@${SERVER_IP}" bash -s << REMOTE_EOF
set -euo pipefail
REMOTE_TMP="$REMOTE_TMP"
MYSQL_CONTAINER="$MYSQL_CONTAINER"
REMOTE_ENV_DIR="$REMOTE_ENV_DIR"

if [ -f "\$HOME/\$REMOTE_ENV_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "\$HOME/\$REMOTE_ENV_DIR/.env"
  set +a
  echo "   (loaded ~/\$REMOTE_ENV_DIR/.env)"
else
  echo "❌ Missing ~/\$REMOTE_ENV_DIR/.env"
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
  echo "❌ No MySQL container found"
  exit 1
fi
echo "   container: \$C  database: \$DB_NAME"

run_one() {
  local num="\$1"
  local label="\$2"
  echo "==> \$label"
  docker exec -i "\$C" mysql -u"\$DB_USER" -p"\$DB_PASSWORD" "\$DB_NAME" < "\$REMOTE_TMP/\${num}.sql"
}

run_one 58 "58_drug_movement.sql"
run_one 59 "59_pharmacy_notifications_reorder.sql"
run_one 60 "60_backfill_drug_inventory_store_id.sql"
run_one 62 "62_chemist_stock_requests_landing.sql"

echo ""
echo "==> Verify"
docker exec "\$C" mysql -u"\$DB_USER" -p"\$DB_PASSWORD" "\$DB_NAME" -e "
  SELECT 'external_chemist_stock_requests' AS t, COUNT(*) AS ok
  FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='external_chemist_stock_requests';
  SELECT location, storeId, COUNT(*) batches, SUM(quantity) qty
  FROM drug_inventory WHERE quantity > 0 GROUP BY location, storeId;
"

rm -rf "\$REMOTE_TMP"
REMOTE_EOF

echo ""
echo "✅ Drug movement migrations 58–60 finished on remote."
echo "   Restart API after code deploy: cd ~/$REMOTE_ENV_DIR && docker compose -f docker-compose.shared-mysql.yml restart api"
