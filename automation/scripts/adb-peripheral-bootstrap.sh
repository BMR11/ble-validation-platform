#!/usr/bin/env bash
# Launch peripheral-app on a connected Android device/emulator and pre-grant BLE-related
# permissions where the platform allows (API 31+). Pair with agent-device replays or manual UI.
set -euo pipefail

PKG="com.bleperipheraldemo"
ACTIVITY="${PKG}/.MainActivity"

echo "[adb-peripheral-bootstrap] Waiting for Android device…"
adb wait-for-device

echo "[adb-peripheral-bootstrap] Granting Bluetooth permissions (best-effort)…"
for perm in \
  android.permission.BLUETOOTH_ADVERTISE \
  android.permission.BLUETOOTH_CONNECT \
  android.permission.BLUETOOTH_SCAN; do
  adb shell pm grant "$PKG" "$perm" 2>/dev/null || true
done

echo "[adb-peripheral-bootstrap] Starting ${ACTIVITY}"
adb shell am start -n "$ACTIVITY" -a android.intent.action.MAIN -c android.intent.category.LAUNCHER

echo "[adb-peripheral-bootstrap] Done. Use agent-device (Android session) or tap UI to select Nordic LBS and Start."
