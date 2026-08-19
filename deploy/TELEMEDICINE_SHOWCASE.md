# Telemedicine showcase clone (shared MySQL, same server)

| | Main HMIS | Telemedicine POC |
|---|---|---|
| Public URL | (existing) | **https://telemed.intellibizafrica.co.ke** |
| Remote dir | `~/intellinex-full/` | `~/intellinex-telemed/` |
| Compose | `docker-compose.shared-mysql.yml` | `docker-compose.telemedicine-shared-mysql.yml` |
| Containers | `kiplombe_*` | `telemed_*` |
| DB | e.g. `intellinex_hmis_db` | `intellinex_telemed_db` |
| Ports | API `3001`, UI `3102` | API **`3011`**, UI **`3112`** (+10) |
| Brand | IntelliNex | IntelliNex Telemed |
| Pack | — | `NEXT_PUBLIC_EXPERIENCE_PACK=telemedicine` |

## Scoped-down modules (restorable)

Source of truth: [`lib/telemedicine-scope.ts`](../lib/telemedicine-scope.ts) — each entry has `status: "scoped_down" | "active"`.

| Module | Paths / category | Status |
|--------|------------------|--------|
| Procurement & Inventory | category `procurement` | scoped_down |
| Financial Management | category `financial` | scoped_down |
| HR Employees | `/hr/employees` | scoped_down |
| Chemist portal | `/chemist/referrals`, `/drugs`, `/stock-requests`, `/labs`, `/history`, `/profile`, `/users` | scoped_down |
| Radiology | `/radiology` | scoped_down |
| Laboratory | `/laboratory` | scoped_down |
| Inpatient / Maternity / ICU / Ambulance | respective paths | scoped_down |

**Restore later (enhance POC):** set that module’s `status` to `"active"`, rebuild frontend, and optionally set the matching `role_menu_items.isAllowed = TRUE` (or re-run Admin → Menu & Tab Access).

Nav hide + soft URL redirect to `/telemedicine` apply when the experience pack is on. Role SQL (`70_telemedicine_showcase_pack.sql`) mirrors the same denies.

## One-time setup

```bash
cp deploy/env.telemedicine.example deploy/.env.telemedicine
# Set DB_PASSWORD, JWT_SECRET, REMOTE_MYSQL_ROOT_PASSWORD, Daily/Zoom keys

REMOTE_MYSQL_ROOT_PASSWORD='…' ./deploy/setup-telemedicine-db-remote.sh

CLONE_FROM_DB=intellinex_hmis_db REMOTE_MYSQL_ROOT_PASSWORD='…' \
  ./deploy/setup-telemedicine-db-remote.sh --clone

LOCAL_ENV_FILE=./deploy/.env.telemedicine \
  ./deploy/deploy-telemedicine-shared-mysql.sh
```

Open firewall/ufw for **3011** and **3112**.

### cPanel subdomain proxy

1. Create subdomain `telemed.intellibizafrica.co.ke` (AutoSSL).
2. Copy [`cpanel-telemed-subdomain-proxy.htaccess.example`](./cpanel-telemed-subdomain-proxy.htaccess.example) to that docroot as `.htaccess`.
3. Confirm VPS IP/ports in the RewriteRules (`3011` / `3112`).

Env already points at:

```env
NEXT_PUBLIC_BASE_URL=https://telemed.intellibizafrica.co.ke/hmis
FRONTEND_URL=https://telemed.intellibizafrica.co.ke
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_EXPERIENCE_PACK=telemedicine
```

## After deploy

- Public: https://telemed.intellibizafrica.co.ke/  
- Direct VPS UI: `http://SERVER:3112/hmis/`  
- Direct VPS API: `http://SERVER:3011/`
