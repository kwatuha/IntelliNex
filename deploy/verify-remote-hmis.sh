#!/usr/bin/env bash
# Quick checks for HMIS on a VPS (run from your laptop OR on the server).
# Usage: SERVER_IP=165.22.227.234 ./deploy/verify-remote-hmis.sh
set -euo pipefail
IP="${SERVER_IP:-165.22.227.234}"
API_PORT="${API_PORT:-3001}"
FE_PORT="${HMIS_FRONTEND_PORT:-3102}"

echo "==> Target: http://${IP}"
echo ""

set +e
echo "==> API http://${IP}:${API_PORT}/"
code=$(curl -sS -o /tmp/hmis-api-check.json -w "%{http_code}" --connect-timeout 10 "http://${IP}:${API_PORT}/" 2>/dev/null)
[[ -z "$code" ]] && code="000"
set -e
echo "    HTTP ${code}"
if [[ "$code" == "200" ]]; then head -c 160 /tmp/hmis-api-check.json; echo ""; else echo "    FAIL"; fi

echo ""
set +e
echo "==> Frontend http://${IP}:${FE_PORT}/hmis/"
fe_code=$(curl -sS -o /tmp/hmis-fe-check.html -w "%{http_code}" --connect-timeout 12 "http://${IP}:${FE_PORT}/hmis/" 2>/dev/null)
[[ -z "$fe_code" ]] && fe_code="000"
set -e
echo "    HTTP ${fe_code}"
if [[ "$fe_code" == "200" ]]; then head -c 200 /tmp/hmis-fe-check.html; echo ""; fi

echo ""
if [[ "$code" == "200" && "$fe_code" != "200" ]]; then
  echo "API OK but frontend not reachable from here. Typical fixes:"
  echo "  • Cloud firewall: allow inbound TCP ${FE_PORT} (security group / network rules)."
  echo "  • On VPS: sudo ufw allow ${FE_PORT}/tcp && sudo ufw reload"
  echo "  • On VPS: docker ps --filter name=kiplombe_frontend; docker logs --tail 80 kiplombe_frontend"
  echo "  • On VPS: curl -sS -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:${FE_PORT}/hmis/"
  echo "    If this is 200 but the internet is not → firewall only."
elif [[ "$fe_code" != "200" ]]; then
  echo "Frontend check failed (HTTP ${fe_code}). See docker logs for kiplombe_frontend."
fi
