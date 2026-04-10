#!/usr/bin/env bash
# Run ON THE VPS (repo root) to see why https://YOUR_IP/ is not reachable.
# Usage: bash deploy/check-https-api.sh
set -euo pipefail

echo "=== 1) TLS files (required for api_https) ==="
SSL_DIR="$(cd "$(dirname "$0")" && pwd)/ssl"
for f in fullchain.pem privkey.pem; do
  if [[ -f "$SSL_DIR/$f" ]]; then
    echo "  OK  $SSL_DIR/$f"
  else
    echo "  MISSING: $SSL_DIR/$f — run: bash deploy/setup-api-https-selfsigned.sh YOUR_PUBLIC_IP"
  fi
done

echo ""
echo "=== 2) Containers (expect kiplombe_api + kiplombe_api_nginx) ==="
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null | grep -E 'kiplombe_api|NAMES' || echo "  (docker not available?)"

echo ""
echo "=== 3) Host listening on 443 / 8443 (ss) ==="
if command -v ss >/dev/null 2>&1; then
  ss -tlnp 2>/dev/null | grep -E ':443|:8443' || echo "  Nothing listening on 443/8443 — api_https not running or wrong API_HTTPS_PORT"
else
  echo "  (install iproute2 for ss)"
fi

echo ""
echo "=== 4) Recent api_https logs (if container exists) ==="
if docker inspect kiplombe_api_nginx >/dev/null 2>&1; then
  docker logs --tail 25 kiplombe_api_nginx 2>&1
else
  echo "  No container kiplombe_api_nginx — start: docker compose -f docker-compose.shared-mysql-api-only.yml --env-file .env up -d"
fi

echo ""
echo "=== 5) Local curl (ignore cert) ==="
curl -sk -o /dev/null -w "  https://127.0.0.1/ → HTTP %{http_code}\n" --connect-timeout 3 https://127.0.0.1/ 2>&1 || echo "  curl failed (nothing on 443 locally?)"

echo ""
echo "=== Reminders ==="
echo "  • Start BOTH services: docker compose -f docker-compose.shared-mysql-api-only.yml --env-file .env up -d"
echo "  • Not only: ... up -d api   (that skips api_https / nginx)"
echo "  • Firewall: sudo ufw allow 443/tcp   and cloud security group TCP 443"
echo "  • Port conflict: if 443 is taken, set API_HTTPS_PORT=8443 in .env and open 8443"
