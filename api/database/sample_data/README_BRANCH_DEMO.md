# Multi-facility (branch) demo data

Script: `api/scripts/seedBranchDemoData.js`

Creates tagged demo activity across **Kiplombe**, **Langas**, and **Elburgon** so Facility Performance and pharmacy transfers show cross-site usage.

## What it seeds

Per satellite + main branch:

- Patients with `registeredBranchId`
- Queue entries, appointments, medical records
- Prescriptions + lab orders
- Invoices / payments with `branchId`
- Drug inventory on that branch’s store
- One pending cross-facility stock transfer (main → satellite)
- Admin users get `canAccessAllBranches`

Rows are tagged `[BRANCH-DEMO]` / `DEMO-BR-*` and can be re-run safely (previous demo rows are removed first).

## Run locally

```bash
cd api
node scripts/seedBranchDemoData.js
```

## Run on VPS

```bash
docker cp api/scripts/seedBranchDemoData.js kiplombe_api:/app/scripts/seedBranchDemoData.js
docker exec kiplombe_api node /app/scripts/seedBranchDemoData.js
```

## View the report

After frontend deploy: **Dashboard → Facility Performance** (`/hmis/facility-performance`)

Or API: `GET /api/dashboard/facility-performance?days=30`
