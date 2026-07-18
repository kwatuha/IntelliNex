# IntelliNex Field (`mobile-collector/`)

Offline-capable Android companion for IntelliNex HMIS, based on the Machakos collector / Kiplombe mobile scaffold.

## Modules

| Tab | Purpose |
|-----|---------|
| **Forms** | Download user-defined field datasets; capture visits offline; sync submissions |
| **Chemist** | External chemist referral list + dispense (queues offline when network fails) |
| **Assets** | Critical asset present/missing verification (offline queue) |
| **Visits** | Local pending queue + recently synced form submissions |

## Backend

- `POST /api/auth/login`, `GET /api/auth/verify`
- `/api/data-collection/templates`, `/api/data-collection/submissions`
- `/api/pharmacy/chemist/me`, `/api/pharmacy/external-referrals`, item PATCH
- `/api/assets/critical/list`, `/api/assets/critical/bulk-verify`

Web authoring: **HMIS → Support & outreach → Field datasets** (`/field-datasets`).

Run MySQL migration:

```bash
# apply api/database/migrations/64_data_collection_field_datasets.sql
```

Tables are also auto-created on first API hit via `ensureDataCollectionTables()`.

## Configure API URL

Edit `src/config/api.ts`:

```ts
export const API_BASE_URL = 'https://intellinex.intellibizafrica.co.ke';
// Emulator → host API: http://10.0.2.2:3001
```

## Build & release APK (one command)

Same pattern as Machakos. From the **repo root**:

```bash
./deploy/release-field-app.sh --version 1.0.0 --notes "Initial Field app"
```

That will:

1. `npm install` in `mobile-collector/` if needed  
2. Set `APP_VERSION` in `src/config/api.ts`  
3. Run Gradle `assembleRelease`  
4. Publish APK to local API uploads + remote VPS (`kiplombe_api` → `/hmis/field-app`)

### Build only

```bash
cd mobile-collector
npm install          # required once — fixes native_modules.gradle missing error
. ./env.sh           # JAVA_HOME + ANDROID_HOME
npm run android:release
```

### Publish existing APK only

```bash
./deploy/release-field-app.sh --version 1.0.1 --skip-build \
  --apk mobile-collector/android/app/build/outputs/apk/release/app-release.apk \
  --notes "Hotfix"
```

Staff download: **https://intellinex.intellibizafrica.co.ke/hmis/field-app**

## Offline behaviour

- Templates, referrals, and critical assets are cached after Sync / login.
- Form submits, chemist dispenses, and asset verifies fall into an outbox on network/502–504 errors.
- Pull-to-refresh on Forms / Chemist / Assets / Visits drains the outbox.

## Next growth

- SQLite + NetInfo auto-sync
- Photo multipart upload endpoint
- QR / pickup-code scanner for chemist and assets
- Pharmacy in-facility ready-to-dispense module
