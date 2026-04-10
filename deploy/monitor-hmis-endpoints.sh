#!/usr/bin/env bash
#
# HTTP checks for HMIS API + frontend (run on your laptop or on the VPS).
# Does not SSH — only curls public URLs. "Resolve" = print suggested fixes when checks fail.
#
# Background (until you stop it):
#   nohup env SERVER_IP=165.22.227.234 INTERVAL_SEC=120 ./deploy/monitor-hmis-endpoints.sh >> /tmp/hmis-monitor.log 2>&1 &
#   tail -f /tmp/hmis-monitor.log
#
# One-shot:
#   SERVER_IP=165.22.227.234 ./deploy/monitor-hmis-endpoints.sh
#
# Env:
#   SERVER_IP        (default 165.22.227.234)
#   API_PORT         (default 3001)
#   HMIS_FRONTEND_PORT / FE_PORT (default 3102)
#   INTERVAL_SEC     sleep between loops (default 60); use 0 for single run
#   MONITOR_LOOPS    max iterations (default 0 = infinite if INTERVAL_SEC>0)
#
set -u

IP="${SERVER_IP:-165.22.227.234}"
API_PORT="${API_PORT:-3001}"
FE_PORT="${HMIS_FRONTEND_PORT:-${FE_PORT:-3102}}"
INTERVAL_SEC="${INTERVAL_SEC:-60}"
LOOPS="${MONITOR_LOOPS:-0}"

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

check_once() {
  local api_code fe_code
  set +e
  api_code=$(curl -sS -o /dev/null -w "%{http_code}" --connect-timeout 12 "http://${IP}:${API_PORT}/" 2>/dev/null)
  [[ -z "$api_code" ]] && api_code="000"
  fe_code=$(curl -sS -o /dev/null -w "%{http_code}" --connect-timeout 15 "http://${IP}:${FE_PORT}/hmis/" 2>/dev/null)
  [[ -z "$fe_code" ]] && fe_code="000"
  set -e

  echo "[$(ts)] API:${API_PORT} HTTP ${api_code}  FE:${FE_PORT}/hmis/ HTTP ${fe_code}"

  if [[ "$api_code" != "200" ]]; then
    echo "  → API: check kiplombe_api: docker logs --tail 80 kiplombe_api"
  fi
  if [[ "$fe_code" != "200" ]]; then
    echo "  → FE:  docker logs -f --tail 100 kiplombe_frontend"
    echo "  → If FE works on VPS (curl 127.0.0.1:${FE_PORT}) but not from internet: open TCP ${FE_PORT} in cloud firewall + ufw."
  fi
}

if [[ "${INTERVAL_SEC}" == "0" ]]; then
  check_once
  exit 0
fi

echo "monitor-hmis-endpoints: IP=${IP} interval=${INTERVAL_SEC}s loops=${LOOPS:-∞} (Ctrl+C to stop)"
i=0
while true; do
  check_once
  i=$((i + 1))
  if [[ "$LOOPS" != "0" && "$i" -ge "$LOOPS" ]]; then
    exit 0
  fi
  sleep "${INTERVAL_SEC}"
done
