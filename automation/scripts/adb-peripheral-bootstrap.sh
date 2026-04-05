#!/usr/bin/env bash
# Launch peripheral-app on a connected Android device/emulator and pre-grant BLE-related
# permissions where the platform allows (API 31+). Pair with agent-device replays or manual UI.
#
# Package id:
#   Debug (default):     com.bleperipheraldemo
#   Release (this repo): com.bleperipheraldemo.release   (see peripheral-app/android/app/build.gradle)
#
# Optional: ANDROID_PERIPHERAL_PACKAGE in automation/.env (see .env.example).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=load-automation-env.sh
source "${SCRIPT_DIR}/load-automation-env.sh"
ble_automation_load_automation_env "${AUTO_DIR}"

PKG="${ANDROID_PERIPHERAL_PACKAGE:-com.bleperipheraldemo}"

_adb() {
  if [[ -n "${ANDROID_SERIAL:-}" ]]; then
    adb -s "${ANDROID_SERIAL}" "$@"
  else
    adb "$@"
  fi
}

echo "[adb-peripheral-bootstrap] Waiting for Android device…"
_adb wait-for-device

echo "[adb-peripheral-bootstrap] Force-stop ${PKG} (clean slate before this run)"
_adb shell am force-stop "$PKG" 2>/dev/null || true

echo "[adb-peripheral-bootstrap] Granting Bluetooth permissions (best-effort)…"
for perm in \
  android.permission.BLUETOOTH_ADVERTISE \
  android.permission.BLUETOOTH_CONNECT \
  android.permission.BLUETOOTH_SCAN; do
  _adb shell pm grant "$PKG" "$perm" 2>/dev/null || true
done

echo "[adb-peripheral-bootstrap] Launching package ${PKG} (launcher via monkey — works for debug + release applicationId)"
_adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1

echo "[adb-peripheral-bootstrap] Done. Use agent-device (Android session) or tap UI to select Nordic LBS and Start."
