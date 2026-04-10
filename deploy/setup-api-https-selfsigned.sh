#!/usr/bin/env bash
#
# Self-signed HTTPS in front of the HMIS API (docker-compose.shared-mysql-api-only.yml service api_https).
# Terminates TLS on port 443 (or API_HTTPS_PORT) and proxies to the Node service on api:3001.
#
# Run ON THE SERVER from the repo root (e.g. ~/intellinex-api). Requires openssl. No sudo.
#
# Usage:
#   bash deploy/setup-api-https-selfsigned.sh
#   bash deploy/setup-api-https-selfsigned.sh 165.22.227.234
#
# Then:
#   docker compose -f docker-compose.shared-mysql-api-only.yml up -d
#
# Static site .env (rebuild): NEXT_PUBLIC_API_URL=https://YOUR_IP
# Browsers will warn on self-signed certs until you trust the cert or use a domain + Let's Encrypt.
#
set -euo pipefail

CN_IP="${1:-165.22.227.234}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
SSL_DIR="$REPO_ROOT/deploy/ssl"
mkdir -p "$SSL_DIR"

if ! command -v openssl >/dev/null 2>&1; then
  echo "Install openssl first (usually preinstalled)."
  exit 1
fi

TMP_CFG="$(mktemp)"
cleanup() { rm -f "$TMP_CFG"; }
trap cleanup EXIT

echo "==> Generating self-signed certificate (825 days) for CN=$CN_IP"

cat > "$TMP_CFG" <<EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
CN = $CN_IP

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
EOF

if [[ "$CN_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "IP.1 = $CN_IP" >> "$TMP_CFG"
  echo "IP.2 = 127.0.0.1" >> "$TMP_CFG"
  echo "DNS.1 = localhost" >> "$TMP_CFG"
else
  echo "DNS.1 = $CN_IP" >> "$TMP_CFG"
  echo "DNS.2 = localhost" >> "$TMP_CFG"
  echo "IP.1 = 127.0.0.1" >> "$TMP_CFG"
fi

openssl req -x509 -nodes -days 825 -newkey rsa:2048 \
  -keyout "$SSL_DIR/privkey.pem" \
  -out "$SSL_DIR/fullchain.pem" \
  -config "$TMP_CFG" \
  -extensions v3_req

chmod 644 "$SSL_DIR/privkey.pem" "$SSL_DIR/fullchain.pem" 2>/dev/null || true

echo ""
echo "==> TLS files: $SSL_DIR/fullchain.pem, privkey.pem"
echo "    (nginx uses committed deploy/nginx-api-only.conf)"
echo ""
echo "Next (on this server):"
echo "  docker compose -f docker-compose.shared-mysql-api-only.yml up -d --build"
echo ""
echo "Test (ignore cert warning):"
echo "  curl -sk https://${CN_IP}/                    # API root (GET)"
echo "  curl -sk -X POST https://${CN_IP}/api/auth/login -H 'Content-Type: application/json' \\"
echo "    -d '{\"username\":\"admin\",\"password\":\"admin123\"}'"
echo ""
echo "Rebuild static HMIS (no trailing slash; omit :443 for default HTTPS port):"
echo "  NEXT_PUBLIC_API_URL=https://${CN_IP}"
echo ""
echo "If port 443 is in use, set API_HTTPS_PORT=8443 and map host 8443 in compose (see docker-compose.shared-mysql-api-only.yml)."
