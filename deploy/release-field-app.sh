#!/usr/bin/env bash
#
# Build IntelliNex Field APK and publish to HMIS (local and/or remote VPS).
# Staff download from /hmis/field-app after publish.
#
# Usage:
#   ./deploy/release-field-app.sh --version 1.0.0
#   ./deploy/release-field-app.sh --version 1.0.1 --notes "Chemist offline dispense"
#   ./deploy/release-field-app.sh --version 1.0.1 --skip-build --apk path/to/app-release.apk
#   ./deploy/release-field-app.sh --version 1.0.0 --local-only
#   ./deploy/release-field-app.sh --version 1.0.0 --remote-only
#
# Defaults match deploy-full-shared-mysql.sh:
#   SERVER_IP=165.22.227.234 SSH_USER=kunye REMOTE_DIR=intellinex-full
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION=""
NOTES=""
SKIP_BUILD=0
LOCAL_ONLY=0
REMOTE_ONLY=0
APK_PATH=""
SERVER_IP="${SERVER_IP:-165.22.227.234}"
SSH_USER="${SSH_USER:-kunye}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/id_asusme}"
REMOTE_DIR="${REMOTE_DIR:-intellinex-full}"
API_CONTAINER="${API_CONTAINER:-kiplombe_api}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.shared-mysql.yml}"

usage() {
  cat <<EOF
Usage: $0 --version VERSION [options]

Options:
  --version VERSION   Required (e.g. 1.0.0) — also written to mobile APP_VERSION
  --notes TEXT        Release notes shown on /hmis/field-app
  --skip-build        Do not run Gradle; use existing APK
  --apk PATH          APK to publish (default: mobile-collector release output)
  --local-only        Publish using local api/.env + local uploads only
  --remote-only       Skip local publish; only push to VPS
  -h, --help

Examples:
  $0 --version 1.0.0
  $0 --version 1.0.1 --notes "Field datasets + chemist POC"
  $0 --version 1.0.1 --skip-build --remote-only
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --notes|--release-notes) NOTES="$2"; shift 2 ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --apk) APK_PATH="$2"; shift 2 ;;
    --local-only) LOCAL_ONLY=1; shift ;;
    --remote-only) REMOTE_ONLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

if [[ -z "$VERSION" ]]; then
  echo "ERROR: --version is required." >&2
  usage >&2
  exit 1
fi

APP_CONFIG="$ROOT/mobile-collector/src/config/api.ts"
if [[ -f "$APP_CONFIG" ]]; then
  echo "==> Syncing mobile-collector APP_VERSION → $VERSION"
  sed -i "s/export const APP_VERSION = '[^']*'/export const APP_VERSION = '${VERSION}'/" "$APP_CONFIG"
fi

DEFAULT_APK="$ROOT/mobile-collector/android/app/build/outputs/apk/release/app-release.apk"
UNSIGNED_APK="$ROOT/mobile-collector/android/app/build/outputs/apk/release/app-release-unsigned.apk"
if [[ -z "$APK_PATH" ]]; then
  APK_PATH="$DEFAULT_APK"
fi

SSH_KEY_PATH="${SSH_KEY_PATH/#\~/$HOME}"
SSH_OPTS=(-i "$SSH_KEY_PATH" -o StrictHostKeyChecking=accept-new -o BatchMode=yes)

if [[ "$SKIP_BUILD" != "1" ]]; then
  echo "==> Building release APK (mobile-collector)"
  if [[ ! -d "$ROOT/mobile-collector/node_modules" ]]; then
    echo "    Installing npm dependencies (first run)..."
    (cd "$ROOT/mobile-collector" && npm install)
  elif [[ ! -f "$ROOT/mobile-collector/node_modules/@react-native-community/cli-platform-android/native_modules.gradle" ]]; then
    echo "    Reinstalling npm dependencies (missing RN Android Gradle helpers)..."
    (cd "$ROOT/mobile-collector" && npm install)
  fi
  # shellcheck disable=SC1091
  set +u
  # env.sh may reference unset vars; keep nounset off while sourcing
  if [[ -f "$ROOT/mobile-collector/env.sh" ]]; then
    # shellcheck source=/dev/null
    . "$ROOT/mobile-collector/env.sh"
  fi
  set -u
  (cd "$ROOT/mobile-collector" && npm run android:release)
fi

if [[ ! -f "$APK_PATH" && -f "$UNSIGNED_APK" ]]; then
  echo "==> Using unsigned release APK (no signing keystore configured)"
  APK_PATH="$UNSIGNED_APK"
fi

if [[ ! -f "$APK_PATH" ]]; then
  echo "ERROR: APK not found at: $APK_PATH" >&2
  echo "Fix: cd mobile-collector && npm install && npm run android:release" >&2
  exit 1
fi

echo "==> APK: $APK_PATH ($(du -h "$APK_PATH" | awk '{print $1}'))"
echo "==> Version: $VERSION"

LOCAL_PUBLISH_OK=0
if [[ "$REMOTE_ONLY" != "1" ]]; then
  echo "==> Publishing locally (api DB + api/uploads/mobile-app)"
  NOTES_ARGS=()
  if [[ -n "$NOTES" ]]; then
    NOTES_ARGS=(--notes "$NOTES")
  fi
  if node "$ROOT/api/scripts/publishFieldAppRelease.js" \
    --version "$VERSION" \
    --apk "$APK_PATH" \
    "${NOTES_ARGS[@]}"; then
    LOCAL_PUBLISH_OK=1
  else
    if [[ "$LOCAL_ONLY" == "1" ]]; then
      echo "ERROR: Local publish failed (is MySQL reachable via api/.env?)." >&2
      exit 1
    fi
    echo "WARNING: Local publish failed (no local DB is normal for VPS-only workflows)."
    echo "         Continuing with remote publish…"
  fi
fi

if [[ "$LOCAL_ONLY" == "1" ]]; then
  echo "==> Done (local-only). Open /hmis/field-app on this machine if API is running locally."
  exit 0
fi

echo "==> Publishing to ${SSH_USER}@${SERVER_IP}:~/${REMOTE_DIR} (container ${API_CONTAINER})"
STAGING_NAME="field-app-${VERSION}-$$.apk"
REMOTE_TMP="/tmp/${STAGING_NAME}"
REMOTE_SCRIPT_TMP="/tmp/publishFieldAppRelease-$$.js"
REMOTE_LIB_TMP="/tmp/mobileAppRelease-$$.js"

# Ship publish helpers from this machine so remote host tree need not be redeployed yet
scp "${SSH_OPTS[@]}" "$APK_PATH" "${SSH_USER}@${SERVER_IP}:${REMOTE_TMP}"
scp "${SSH_OPTS[@]}" "$ROOT/api/scripts/publishFieldAppRelease.js" "${SSH_USER}@${SERVER_IP}:${REMOTE_SCRIPT_TMP}"
scp "${SSH_OPTS[@]}" "$ROOT/api/lib/mobileAppRelease.js" "${SSH_USER}@${SERVER_IP}:${REMOTE_LIB_TMP}"

ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SERVER_IP}" bash -s <<REMOTE_EOF
set -euo pipefail
REMOTE_DIR="${REMOTE_DIR}"
COMPOSE_FILE="${COMPOSE_FILE}"
API_CONTAINER="${API_CONTAINER}"
REMOTE_TMP="${REMOTE_TMP}"
REMOTE_SCRIPT_TMP="${REMOTE_SCRIPT_TMP}"
REMOTE_LIB_TMP="${REMOTE_LIB_TMP}"
VERSION="${VERSION}"
NOTES=$(printf '%q' "$NOTES")

cd "\$HOME/\$REMOTE_DIR"
if ! docker ps --format '{{.Names}}' | grep -qx "\$API_CONTAINER"; then
  # Fallback: find API container from compose project
  API_CONTAINER=\$(docker compose -f "\$COMPOSE_FILE" --env-file .env ps -q api 2>/dev/null | head -1)
  if [[ -z "\$API_CONTAINER" ]]; then
    echo "ERROR: API container not running in ~/\$REMOTE_DIR" >&2
    exit 1
  fi
  API_CONTAINER=\$(docker inspect -f '{{.Name}}' "\$API_CONTAINER" | sed 's#^/##')
fi

docker exec "\$API_CONTAINER" mkdir -p /app/uploads/mobile-app /app/scripts /app/lib
docker cp "\$REMOTE_TMP" "\$API_CONTAINER:/app/uploads/mobile-app/\$VERSION-incoming.apk"
docker cp "\$REMOTE_SCRIPT_TMP" "\$API_CONTAINER:/app/scripts/publishFieldAppRelease.js"
docker cp "\$REMOTE_LIB_TMP" "\$API_CONTAINER:/app/lib/mobileAppRelease.js"
rm -f "\$REMOTE_TMP" "\$REMOTE_SCRIPT_TMP" "\$REMOTE_LIB_TMP"

NOTES_FLAG=()
if [[ -n "\$NOTES" && "\$NOTES" != "''" ]]; then
  NOTES_FLAG=(--notes "\$NOTES")
fi

docker exec "\$API_CONTAINER" node /app/scripts/publishFieldAppRelease.js \\
  --version "\$VERSION" \\
  --apk "/app/uploads/mobile-app/\$VERSION-incoming.apk" \\
  "\${NOTES_FLAG[@]}"

echo "Published on server. Staff can download at /hmis/field-app"
REMOTE_EOF

echo "==> Done. Open https://intellinex.intellibizafrica.co.ke/hmis/field-app"
if [[ "$REMOTE_ONLY" != "1" && "$LOCAL_PUBLISH_OK" != "1" ]]; then
  echo "    (Local DB publish was skipped/failed — production is the source of truth.)"
fi
