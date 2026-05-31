#!/usr/bin/env bash
# =============================================================================
# Run telemedicine SQL migrations (40–43 + 49) on the REMOTE server (e.g. 41.89.173.8)
# =============================================================================
# 1) Copies SQL files to /tmp on the server via scp
# 2) SSH runs docker exec mysql (root) inside kiplombe_mysql, reading MYSQL_ROOT_PASSWORD
#    from ~/kiplombe-hmis/.env on the server when present (else deploy-config / env).
#
# From repo root:
#   chmod +x deploy/run-telemedicine-migrations-remote.sh
#   ./deploy/run-telemedicine-migrations-remote.sh
#
# If your remote root password is only in deploy-config.sh, export it before running:
#   source deploy/deploy-config.sh && ./deploy/run-telemedicine-migrations-remote.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [ -f "$SCRIPT_DIR/deploy-config.sh" ]; then
  # shellcheck source=deploy/deploy-config.sh
  source "$SCRIPT_DIR/deploy-config.sh"
fi

SERVER_IP="${SERVER_IP:-41.89.173.8}"
SSH_USER="${SSH_USER:-fhir}"
SSH_KEY_PATH="${SSH_KEY_PATH:-~/.ssh/id_asusme}"
SSH_KEY_PATH="${SSH_KEY_PATH/#\~/$HOME}"
CONTAINER_NAME="${MYSQL_CONTAINER:-kiplombe_mysql}"
DB_NAME="${MYSQL_DATABASE:-kiplombe_hmis}"

SQL40="$REPO_ROOT/api/database/migrations/40_telemedicine_sessions_schema.sql"
SQL41="$REPO_ROOT/api/database/migrations/41_telemedicine_zoom_manual.sql"
SQL42="$REPO_ROOT/api/database/migrations/42_user_telemedicine_defaults.sql"
SQL43="$REPO_ROOT/api/database/migrations/43_telemedicine_queue_origin.sql"
SQL49="$REPO_ROOT/api/database/migrations/49_telemedicine_video_providers.sql"

for f in "$SQL40" "$SQL41" "$SQL42" "$SQL43" "$SQL49"; do
  if [[ ! -f "$f" ]]; then
    echo "❌ Missing: $f"
    exit 1
  fi
done

if [[ ! -f "$SSH_KEY_PATH" ]]; then
  echo "❌ SSH key not found: $SSH_KEY_PATH"
  exit 1
fi

REMOTE_TMP="/tmp/kiplombe_tmig_$(date +%s)"
REMOTE_PASS="${MYSQL_ROOT_PASSWORD:-kiplombe_root_pass_2024}"

echo "=============================================="
echo " Telemedicine migrations → REMOTE MySQL"
echo "=============================================="
echo " Server:     $SSH_USER@$SERVER_IP"
echo " Staging:    $REMOTE_TMP"
echo " Container:  $CONTAINER_NAME"
echo " Database:   $DB_NAME"
echo ""

echo "📤 Uploading SQL files..."
ssh -q -T -o BatchMode=yes -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no \
  "${SSH_USER}@${SERVER_IP}" "mkdir -p $REMOTE_TMP"

scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no \
  "$SQL40" "${SSH_USER}@${SERVER_IP}:${REMOTE_TMP}/40.sql"
scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no \
  "$SQL41" "${SSH_USER}@${SERVER_IP}:${REMOTE_TMP}/41.sql"
scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no \
  "$SQL42" "${SSH_USER}@${SERVER_IP}:${REMOTE_TMP}/42.sql"
scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no \
  "$SQL43" "${SSH_USER}@${SERVER_IP}:${REMOTE_TMP}/43.sql"
scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no \
  "$SQL49" "${SSH_USER}@${SERVER_IP}:${REMOTE_TMP}/49.sql"

echo "📥 Running migrations inside Docker MySQL on server..."
# shellcheck disable=SC2029
ssh -q -T -o BatchMode=yes -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no \
  "${SSH_USER}@${SERVER_IP}" bash -s << REMOTE_EOF
set -euo pipefail
REMOTE_TMP="$REMOTE_TMP"
DB_NAME="$DB_NAME"
CONTAINER_NAME="$CONTAINER_NAME"
FALLBACK_PW=$(printf '%q' "$REMOTE_PASS")

# Load server .env (password often differs from deploy-config)
for d in "\$HOME/kiplombe-hmis" "\$HOME/kiplombehmis" "\$HOME/dev/kiplombehmis"; do
  if [ -f "\$d/.env" ]; then
    set -a
    # shellcheck disable=SC1090
    . "\$d/.env"
    set +a
    echo "   (loaded .env from \$d)"
    break
  fi
done

MYSQL_ROOT_PASSWORD="\${MYSQL_ROOT_PASSWORD:-\$FALLBACK_PW}"
DB_NAME="\${MYSQL_DATABASE:-\$DB_NAME}"

C="\$(docker ps --format '{{.Names}}' | grep -E 'mysql|MariaDB' | head -1)"
if [ -z "\$C" ]; then
  C="\$CONTAINER_NAME"
fi
echo "   container: \$C"

run_one() {
  local num="\$1"
  local label="\$2"
  echo "==> \$label"
  docker exec -i "\$C" mysql -uroot -p"\$MYSQL_ROOT_PASSWORD" "\$DB_NAME" < "\$REMOTE_TMP/\${num}.sql"
}

run_one 40 "40_telemedicine_sessions_schema.sql"
run_one 41 "41_telemedicine_zoom_manual.sql"
run_one 42 "42_user_telemedicine_defaults.sql"
run_one 43 "43_telemedicine_queue_origin.sql"
run_one 49 "49_telemedicine_video_providers.sql"

rm -rf "\$REMOTE_TMP"
echo "   (removed \$REMOTE_TMP)"
REMOTE_EOF

echo ""
echo "✅ Telemedicine migrations 40–43 + 49 finished on remote (${DB_NAME})."
