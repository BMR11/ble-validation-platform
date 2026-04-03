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

# shellcheck source=load-automation-env.sh
# Optional automation/.env — keys only applied if unset (export in shell still wins).
source "${SCRIPT_DIR}/load-automation-env.sh"
ble_automation_load_env "${AUTO_DIR}/.env"

PERIPH_SESSION="${PERIPH_SESSION:-ble-demo-peripheral}"
CENT_SESSION_BASE="${CENT_SESSION:-ble-demo-central}"
# agent-device ~0.11: `open --device` with a *named* --session requires --session-lock strip, which
# then targets Simulator. The working CLI uses no --session (implicit "default") — but while the
# Android peripheral session exists, "default" cannot drive iOS. We close the peripheral session
# before each iOS phase, then use IOS_AGENT_SESSION (default) for iOS open + replay.
IOS_AGENT_SESSION="${IOS_AGENT_SESSION:-default}"
ANDROID_SERIAL="${ANDROID_SERIAL:-}"
IOS_UDID="${IOS_UDID:-}"
# Physical iPhone name (e.g. iPhone-RG). Without IOS_UDID or IOS_DEVICE, agent-device often picks a simulator.
IOS_DEVICE="${IOS_DEVICE:-}"
# Debug: com.bleperipheraldemo | Release APK from this repo: com.bleperipheraldemo.release
ANDROID_PERIPHERAL_PACKAGE="${ANDROID_PERIPHERAL_PACKAGE:-com.bleperipheraldemo}"
export ANDROID_PERIPHERAL_PACKAGE

if [[ ! -d "${AUTO_DIR}/node_modules/agent-device" ]]; then
  echo "Install automation deps first: cd automation && npm install" >&2
  exit 1
fi

AD_BASE=(npx --yes --prefix "${AUTO_DIR}" agent-device)

# Physical iPhone: pass --device "Name" (matches Xcode/Finder), not --udid. On some setups
# `open`/replay with the USB UDID string incorrectly routes to a booted Simulator; the same
# name used in `agent-device open "App" --platform ios --device "iPhone-RG"` works.

if [[ "${ALLOW_IOS_SIMULATOR_UNTARGETED:-0}" != "1" && -z "${IOS_UDID:-}" && -z "${IOS_DEVICE:-}" ]]; then
  echo "Error: Set IOS_DEVICE (e.g. iPhone-RG) or IOS_UDID for the central iPhone." >&2
  echo "  Prefer IOS_DEVICE=name from: cd ${AUTO_DIR} && npx agent-device devices --json" >&2
  exit 1
fi

export IOS_AGENT_SESSION

ad_adb() {
  if [[ -n "${ANDROID_SERIAL}" ]]; then
    adb -s "${ANDROID_SERIAL}" "$@"
  else
    adb "$@"
  fi
}

# Hard-stop peripheral app so the next launch/replay starts cold (no stale GATT/UI state).
ad_force_stop_peripheral() {
  echo "[e2e] adb force-stop ${ANDROID_PERIPHERAL_PACKAGE}"
  ad_adb shell am force-stop "${ANDROID_PERIPHERAL_PACKAGE}" 2>/dev/null || true
}

ad_close_peripheral() {
  run_ad android --session "${PERIPH_SESSION}" --platform android close || true
}

# Close automation sessions and hard-stop the peripheral APK (Android has no session-only "restart").
ble_e2e_close_sessions_and_stop_peripheral_app() {
  ad_close_peripheral
  run_ad ios --session "${IOS_AGENT_SESSION}" close || true
  run_ad ios --session "${CENT_SESSION_BASE}" close || true
  ad_force_stop_peripheral
}

# Start of every run: no stale agent-device sessions or peripheral process from last time.
e2e_fresh_start_cleanup() {
  echo "🟡 == 0a) New run: reset sessions + force-stop peripheral (clean slate)"
  ble_e2e_close_sessions_and_stop_peripheral_app
}

run_ad() {
  local platform="$1"
  shift
  local cmd=( "${AD_BASE[@]}" )
  if [[ "${platform}" == "android" && -n "${ANDROID_SERIAL}" ]]; then
    cmd+=(--serial "${ANDROID_SERIAL}")
  fi
  if [[ "${platform}" == "ios" ]]; then
    cmd+=(--platform ios --target mobile)
    # Do not use --session-lock strip here: with physical --device it routes to Simulator.
    if [[ -n "${IOS_DEVICE}" ]]; then
      cmd+=(--device "${IOS_DEVICE}")
    elif [[ -n "${IOS_UDID}" ]]; then
      cmd+=(--udid "${IOS_UDID}")
    fi
  fi
  cmd+=("$@")
  "${cmd[@]}"
}

_E2E_TEARDOWN_DONE=0
# Runs on EXIT (failure, SIGINT/SIGHUP, etc.) so sessions + peripheral app don’t stay dirty for the next run.
e2e_teardown_on_exit() {
  if [[ "${E2E_SKIP_EXIT_TEARDOWN:-0}" == "1" ]]; then
    return 0
  fi
  if [[ "${_E2E_TEARDOWN_DONE}" == "1" ]]; then
    return 0
  fi
  _E2E_TEARDOWN_DONE=1
  echo "🟡 == (exit teardown) Close sessions + force-stop peripheral app" >&2
  ble_e2e_close_sessions_and_stop_peripheral_app || true
}

trap 'e2e_teardown_on_exit' EXIT

# agent-device (~0.11): `open` inside `replay` ignores CLI --device/--udid and targets the booted Simulator.
# Use the same top-level `open` pattern that works on device, then replay a script with that line removed.
IOS_CENTRAL_DISPLAY_NAME="${IOS_CENTRAL_DISPLAY_NAME:-BleCentralDemo}"
IOS_CENTRAL_BUNDLE_REPLAY="${IOS_CENTRAL_BUNDLE_REPLAY:-org.reactjs.native.example.BleCentralDemo}"
# open --relaunch terminates the app first; some devices/agent-device builds fail with "Failed to terminate iOS app".
E2E_IOS_OPEN_RELAUNCH="${E2E_IOS_OPEN_RELAUNCH:-0}"

run_ios_open_central() {
  # Exact working shape (no --session): open "BleCentralDemo" --platform ios --device "iPhone-RG"
  # Requires ad_close_peripheral first so "default" is not blocked by the Android session.
  local cmd=( "${AD_BASE[@]}" )
  cmd+=(open "${IOS_CENTRAL_DISPLAY_NAME}")
  cmd+=(--platform ios)
  if [[ -n "${IOS_DEVICE}" ]]; then
    cmd+=(--device "${IOS_DEVICE}")
  elif [[ -n "${IOS_UDID}" ]]; then
    cmd+=(--udid "${IOS_UDID}")
  fi
  if [[ "${E2E_IOS_OPEN_RELAUNCH}" == "1" ]]; then
    cmd+=(--relaunch)
  fi
  "${cmd[@]}"
}

ios_replay_strip_open() {
  local src="$1"
  local tmp="$2"
  local bundle="${IOS_CENTRAL_BUNDLE_REPLAY}"
  while IFS= read -r line || [[ -n "${line}" ]]; do
    if [[ "${line}" == "open ${bundle}" ]]; then
      continue
    fi
    printf '%s\n' "${line}"
  done <"${src}" >"${tmp}"
}

ios_replay() {
  local src="$1"
  local tmp
  tmp="$(mktemp "${TMPDIR:-/tmp}/ble-demo-ios-replay.XXXXXX")"
  ios_replay_strip_open "${src}" "${tmp}"
  ad_close_peripheral
  run_ios_open_central
  run_ad ios --session "${IOS_AGENT_SESSION}" replay "${tmp}"
  rm -f "${tmp}"
}

# Android .ad files use "open com.bleperipheraldemo"; substitute release (or custom) package id.
android_replay() {
  local src="$1"
  local tmp
  # macOS mktemp requires the template to end with XXXXXX (no suffix after it).
  tmp="$(mktemp "${TMPDIR:-/tmp}/ble-demo-android-replay.XXXXXX")"
  sed "s/^open com\\.bleperipheraldemo$/open ${ANDROID_PERIPHERAL_PACKAGE}/g" "$src" >"$tmp"
  ad_force_stop_peripheral
  run_ad android --session "${PERIPH_SESSION}" --platform android replay "$tmp"
  rm -f "$tmp"
}

e2e_fresh_start_cleanup

echo "🟡 == 0b) iOS: open central (${IOS_AGENT_SESSION}); E2E_IOS_OPEN_RELAUNCH=${E2E_IOS_OPEN_RELAUNCH}"
run_ios_open_central

echo "🟡 == 0) adb (automated): launch peripheral package + BLE permission grants"
if [[ "${SKIP_ADB_BOOTSTRAP:-0}" != "1" ]]; then
  bash "${SCRIPT_DIR}/adb-peripheral-bootstrap.sh"
else
  echo "    (skipped SKIP_ADB_BOOTSTRAP=1)"
fi

echo "🟡 == 1) agent-device Android replay: 01-start-nordic-lbs.ad (open → Nordic LBS → Start)"
android_replay "${AUTO_DIR}/replays/android/01-start-nordic-lbs.ad"

echo "🟡 == 2) iOS: connect + baseline (Button: Released, Battery: 50%) — 02-connect-and-baseline.ad"
ios_replay "${AUTO_DIR}/replays/ios/02-connect-and-baseline.ad"

echo "🟡 == 3) Android: peripheral battery +10 (50→60); 4) iOS: assert Battery: 60%"
android_replay "${AUTO_DIR}/replays/android/peripheral-battery-plus-10-once.ad"
ios_replay "${AUTO_DIR}/replays/ios/central-assert-battery-60.ad"

echo "🟡 == 5) Android: toggle LBS button; 6) iOS: assert Button: Pressed"
android_replay "${AUTO_DIR}/replays/android/03-toggle-lbs-button.ad"
ios_replay "${AUTO_DIR}/replays/ios/04-assert-button-pressed.ad"

echo "🟡 == 7) iOS: LED ON; 8) Android: assert peripheral LED: ON"
ios_replay "${AUTO_DIR}/replays/ios/central-led-on.ad"
android_replay "${AUTO_DIR}/replays/android/peripheral-assert-led-on.ad"

echo "🟡 == 9) iOS: LED OFF; 10) Android: assert peripheral LED: OFF"
ios_replay "${AUTO_DIR}/replays/ios/central-led-off.ad"
android_replay "${AUTO_DIR}/replays/android/peripheral-assert-led-off.ad"

echo "🟡 == 11) Teardown: close sessions + force-stop peripheral app"
ble_e2e_close_sessions_and_stop_peripheral_app
_E2E_TEARDOWN_DONE=1

echo "LBS + battery E2E flow finished OK."
