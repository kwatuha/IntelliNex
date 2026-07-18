#!/usr/bin/env bash
# Build release APK for IntelliNex Field. Ensures npm deps + Android env are set.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -d node_modules ]] || [[ ! -f node_modules/@react-native-community/cli-platform-android/native_modules.gradle ]]; then
  echo "==> npm install (required for Gradle native_modules.gradle)"
  npm install
fi

set +u
if [[ -f ./env.sh ]]; then
  # shellcheck source=/dev/null
  . ./env.sh
fi
set -u

if [[ -z "${JAVA_HOME:-}" || ! -d "${JAVA_HOME:-}" ]]; then
  echo "WARN: JAVA_HOME not set or missing. Prefer: . ./env.sh" >&2
fi
if [[ -z "${ANDROID_HOME:-}" || ! -d "${ANDROID_HOME:-}" ]]; then
  echo "WARN: ANDROID_HOME not set or missing. Prefer: . ./env.sh" >&2
fi

echo "==> ./gradlew assembleRelease"
cd android
./gradlew assembleRelease
cd ..

OUT="android/app/build/outputs/apk/release/app-release.apk"
UNSIGNED="android/app/build/outputs/apk/release/app-release-unsigned.apk"
if [[ -f "$OUT" ]]; then
  echo "Done: $OUT"
elif [[ -f "$UNSIGNED" ]]; then
  echo "Done (unsigned): $UNSIGNED"
else
  echo "ERROR: APK not found after build." >&2
  exit 1
fi
