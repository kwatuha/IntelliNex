# Self-signed TLS files (generated)

- Full stack (Docker deploy nginx + frontend): **`bash deploy/setup-https-selfsigned.sh`**
- **API-only** TLS (`docker-compose.shared-mysql-api-only.yml`, service `api_https`): **`bash deploy/setup-api-https-selfsigned.sh YOUR_PUBLIC_IP`**

Run from the repo root on the server.

This directory will contain `fullchain.pem` and `privkey.pem`. They are **gitignored** — do not commit them.

Browsers will show a **warning** until you trust the certificate or switch to a real domain with Let’s Encrypt.
