#!/usr/bin/env bash
# Cross-device validation: Android peripheral-app (Nordic LBS profile) + iOS central-app.
# Prerequisites:
#   - Physical Android with BLE peripheral + USB debugging (or emulator if your stack supports BLE).
#   - Physical iPhone or iOS simulator with BLE central (simulator often has no real BLE — prefer device).
#   - Both apps installed; Metro not required for release builds.
#   - From repo root: (cd automation && npm install)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${AUTO_DIR}/.." && pwd)"

PERIPH_SESSION="${PERIPH_SESSION:-ble-demo-peripheral}"
CENT_SESSION="${CENT_SESSION:-ble-demo-central}"
ANDROID_SERIAL="${ANDROID_SERIAL:-}"
IOS_UDID="${IOS_UDID:-}"

if [[ ! -d "${AUTO_DIR}/node_modules/agent-device" ]]; then
  echo "Install automation deps first: cd automation && npm install" >&2
  exit 1
fi

AD_BASE=(npx --yes --prefix "${AUTO_DIR}" agent-device)

run_ad() {
  local platform="$1"
  shift
  local cmd=( "${AD_BASE[@]}" )
  if [[ "${platform}" == "android" && -n "${ANDROID_SERIAL}" ]]; then
    cmd+=(--serial "${ANDROID_SERIAL}")
  fi
  if [[ "${platform}" == "ios" && -n "${IOS_UDID}" ]]; then
    cmd+=(--udid "${IOS_UDID}")
  fi
  cmd+=("$@")
  "${cmd[@]}"
}

echo "== 0) Optional: adb launch + permission grants for peripheral"
if [[ "${SKIP_ADB_BOOTSTRAP:-0}" != "1" ]]; then
  bash "${SCRIPT_DIR}/adb-peripheral-bootstrap.sh"
else
  echo "    (skipped SKIP_ADB_BOOTSTRAP=1)"
fi

echo "== 1) Android: open app, select Nordic LBS, start advertising"
run_ad android --session "${PERIPH_SESSION}" --platform android replay "${AUTO_DIR}/replays/android/01-start-nordic-lbs.ad"

echo "== 2) iOS: select Nordic target, scan, connect, assert baseline metrics"
run_ad ios --session "${CENT_SESSION}" --platform ios replay "${AUTO_DIR}/replays/ios/02-connect-and-baseline.ad"

echo "== 3) Android: toggle LBS button (peripheral notifies central)"
run_ad android --session "${PERIPH_SESSION}" --platform android replay "${AUTO_DIR}/replays/android/03-toggle-lbs-button.ad"

echo "== 4) iOS: foreground central and assert Button: Pressed"
run_ad ios --session "${CENT_SESSION}" --platform ios replay "${AUTO_DIR}/replays/ios/04-assert-button-pressed.ad"

echo "== 5) Android: raise battery slider (+10 x3 from default 50% → 80%)"
run_ad android --session "${PERIPH_SESSION}" --platform android replay "${AUTO_DIR}/replays/android/05-battery-to-80.ad"

echo "== 6) iOS: foreground central and assert Battery: 80%"
run_ad ios --session "${CENT_SESSION}" --platform ios replay "${AUTO_DIR}/replays/ios/06-assert-battery-80.ad"

echo "== 7) Close named sessions"
run_ad android --session "${PERIPH_SESSION}" --platform android close || true
run_ad ios --session "${CENT_SESSION}" --platform ios close || true

echo "LBS + battery E2E flow finished OK."
