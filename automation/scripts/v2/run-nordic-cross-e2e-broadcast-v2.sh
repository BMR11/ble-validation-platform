#!/usr/bin/env bash
# Nordic LBS cross-device E2E: Android peripheral driven by ADB broadcasts (no tap replay on
# peripheral); iOS central uses agent-device replay (tap).
#
# Clean step output: 🟣 = peripheral (Android), 🔵 = central (iOS).
#   V2_DEBUG=1 or -d / --debug  Show benign session-close output (e.g. SESSION_NOT_FOUND) and
#                  full agent-device/adb child output (also sets V2_VERBOSE). Env after load;
#                  CLI -d forces V2_DEBUG=1.
#
# Usage: run-nordic-cross-e2e-broadcast-v2.sh [-d|--debug] [-h|--help]
#
# Prerequisites: same as automation/scripts/run-lbs-battery-e2e.sh (devices, apps, npm install).
#
# Env: ANDROID_SERIAL, IOS_DEVICE or IOS_UDID, ANDROID_PERIPHERAL_PACKAGE, IOS_CENTRAL_BUNDLE_REPLAY,
#      PERIPH_SESSION, IOS_AGENT_SESSION, CENT_SESSION, V2_BROADCAST_GAP_MS (default 450),
#      V2_POST_BOOTSTRAP_MS (default 2000), SKIP_ADB_BOOTSTRAP, V2_VERBOSE (default 0),
#      V2_DEBUG (default 0; CLI -d forces 1).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# shellcheck source=../load-automation-env.sh
source "${SCRIPT_DIR}/../load-automation-env.sh"
ble_automation_load_automation_env "${AUTO_DIR}"

V2_DEBUG="${V2_DEBUG:-0}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    -d | --debug)
      V2_DEBUG=1
      shift
      ;;
    -h | --help)
      cat <<'EOF'
Nordic LBS cross-e2E (v2): Android peripheral via adb broadcasts + iPhone central via UI replay.

Usage:
  bash automation/scripts/v2/run-nordic-cross-e2e-broadcast-v2.sh [options]

Options:
  -d, --debug   Show tool diagnostics (agent-device session close, adb details, etc.)
  -h, --help    Show this help

Configure devices and app names in automation/.env (see automation/.env.example).
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $1 (try --help)" >&2
      exit 1
      ;;
  esac
done

PERIPH_SESSION="${PERIPH_SESSION:-ble-demo-peripheral}"
CENT_SESSION_BASE="${CENT_SESSION:-ble-demo-central}"
IOS_AGENT_SESSION="${IOS_AGENT_SESSION:-default}"
ANDROID_SERIAL="${ANDROID_SERIAL:-}"
IOS_UDID="${IOS_UDID:-}"
IOS_DEVICE="${IOS_DEVICE:-}"
ANDROID_PERIPHERAL_PACKAGE="${ANDROID_PERIPHERAL_PACKAGE:-com.bleperipheraldemo}"
export ANDROID_PERIPHERAL_PACKAGE

V2_BROADCAST_GAP_MS="${V2_BROADCAST_GAP_MS:-200}"
V2_POST_BOOTSTRAP_MS="${V2_POST_BOOTSTRAP_MS:-1500}"
V2_VERBOSE="${V2_VERBOSE:-0}"
if [[ "${V2_DEBUG}" == "1" ]]; then
  V2_VERBOSE=1
fi

if [[ ! -d "${AUTO_DIR}/node_modules/agent-device" ]]; then
  echo "Install automation deps first: cd automation && npm install" >&2
  exit 1
fi

AD_BASE=(npx --yes --prefix "${AUTO_DIR}" agent-device)

if [[ "${ALLOW_IOS_SIMULATOR_UNTARGETED:-0}" != "1" && -z "${IOS_UDID:-}" && -z "${IOS_DEVICE:-}" ]]; then
  echo "Error: Set IOS_DEVICE (e.g. iPhone-RG) or IOS_UDID for the central iPhone." >&2
  echo "  Prefer IOS_DEVICE=name from: cd ${AUTO_DIR} && npx agent-device devices --json" >&2
  exit 1
fi

export IOS_AGENT_SESSION

IOS_CENTRAL_BUNDLE_REPLAY="${IOS_CENTRAL_BUNDLE_REPLAY:-org.reactjs.native.example.BleCentralDemo}"

# Optional agent-device `close` — often fails with SESSION_NOT_FOUND; suppress unless V2_DEBUG=1.
_v2_close_session_optional() {
  local log
  log="$(mktemp "${TMPDIR:-/tmp}/v2-close.XXXXXX")"
  if "$@" >"$log" 2>&1; then
    if [[ "${V2_DEBUG}" == "1" ]]; then
      cat "$log"
    fi
  else
    if [[ "${V2_DEBUG}" == "1" ]]; then
      cat "$log" >&2
    fi
  fi
  rm -f "$log"
  return 0
}

# Real steps: capture output; on failure print log; with V2_VERBOSE print success output too.
_v2_run_capture() {
  local log
  log="$(mktemp "${TMPDIR:-/tmp}/v2-cap.XXXXXX")"
  if "$@" >"$log" 2>&1; then
    if [[ "${V2_VERBOSE}" == "1" ]]; then
      cat "$log"
    fi
    rm -f "$log"
    return 0
  fi
  cat "$log" >&2
  rm -f "$log"
  return 1
}

_V2_SN=0
v2_peri() {
  _V2_SN=$((_V2_SN + 1))
  printf 'Step %d => [🟣 Peripheral] %s\n' "${_V2_SN}" "$*"
}

v2_cent() {
  _V2_SN=$((_V2_SN + 1))
  printf 'Step %d => [🔵 Central] %s\n' "${_V2_SN}" "$*"
}

v2_done() {
  _V2_SN=$((_V2_SN + 1))
  printf 'Step %d => 🧹 %s\n' "${_V2_SN}" "$*"
}

ad_adb() {
  if [[ -n "${ANDROID_SERIAL}" ]]; then
    adb -s "${ANDROID_SERIAL}" "$@"
  else
    adb "$@"
  fi
}

ad_force_stop_peripheral() {
  ad_adb shell am force-stop "${ANDROID_PERIPHERAL_PACKAGE}" 2>/dev/null || true
}

ad_close_peripheral() {
  _v2_close_session_optional run_ad android --session "${PERIPH_SESSION}" --platform android close
}

ble_v2_close_sessions_and_stop_peripheral_app() {
  # Run all close calls in parallel — each is independent and benign on failure.
  ad_close_peripheral &
  _v2_close_session_optional run_ad ios --session "${IOS_AGENT_SESSION}" close "${IOS_CENTRAL_BUNDLE_REPLAY}" &
  _v2_close_session_optional run_ad ios --session "${IOS_AGENT_SESSION}" close &
  _v2_close_session_optional run_ad ios --session "${CENT_SESSION_BASE}" close &
  wait
  ad_force_stop_peripheral
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
e2e_teardown_on_exit() {
  if [[ "${E2E_SKIP_EXIT_TEARDOWN:-0}" == "1" ]]; then
    return 0
  fi
  if [[ "${_E2E_TEARDOWN_DONE}" == "1" ]]; then
    return 0
  fi
  _E2E_TEARDOWN_DONE=1
  if [[ "${V2_DEBUG}" == "1" ]]; then
    printf '   (exit) Teardown: close sessions + stop central app + force-stop peripheral\n' >&2
  fi
  ble_v2_close_sessions_and_stop_peripheral_app || true
}

trap 'e2e_teardown_on_exit' EXIT

E2E_IOS_OPEN_RELAUNCH="${E2E_IOS_OPEN_RELAUNCH:-0}"

run_ios_open_central() {
  local cmd=( "${AD_BASE[@]}" )
  cmd+=(open "${CENTRAL_APP_NAME}")
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

ios_replay_v2_segment() {
  local src="$1"
  local tmp
  tmp="$(mktemp "${TMPDIR:-/tmp}/ble-demo-ios-v2-part.XXXXXX")"
  ios_replay_strip_open "${src}" "${tmp}"
  _v2_run_capture run_ad ios --session "${IOS_AGENT_SESSION}" replay "${tmp}"
  rm -f "${tmp}"
}

v2_sleep_gap() {
  sleep "$(awk "BEGIN { printf \"%.3f\", ${V2_BROADCAST_GAP_MS}/1000 }")"
}

v2_broadcast() {
  _v2_run_capture bash "${SCRIPT_DIR}/adb-send-automation-broadcast.sh" "$@"
  v2_sleep_gap
}

v2_print_run_header() {
  printf '\n'
  printf '  ╔══════════════════════════════════════════════════════════════════╗\n'
  printf '  ║                                                                  ║\n'
  printf '  ║   Cross-Platform BLE End-to-End Validation on Real Devices       ║\n'
  printf '  ║   Automated verification of GATT communication                   ║\n'
  printf '  ║   between iOS central(🔵) and Android peripheral(🟣)             ║\n'
  printf '  ║                                                                  ║\n'
  printf '  ╚══════════════════════════════════════════════════════════════════╝\n'
  if [[ "${V2_DEBUG}" == "1" ]]; then
    printf '    (debug: full tool output enabled)\n'
  fi
  printf '\n'
}

_V2_START_EPOCH=0

# --- Run ---
_V2_START_EPOCH=$(date +%s)
v2_print_run_header

v2_peri "Reset: end any previous run and stop the peripheral app"
ble_v2_close_sessions_and_stop_peripheral_app

v2_peri "Start the peripheral app and allow Bluetooth (if prompted)"
if [[ "${SKIP_ADB_BOOTSTRAP:-0}" != "1" ]]; then
  _v2_run_capture bash "${SCRIPT_DIR}/../adb-peripheral-bootstrap.sh"
else
  printf '      (skipped: peripheral app already running — SKIP_ADB_BOOTSTRAP=1)\n'
fi

v2_peri "Wait for the peripheral app to be ready for remote commands"
sleep "$(awk "BEGIN { printf \"%.3f\", ${V2_POST_BOOTSTRAP_MS}/1000 }")"

v2_peri "Use Local profiles"
v2_broadcast AUTOMATION_SELECT_LOCAL
v2_peri "Select the Nordic LED/Button demo"
v2_broadcast AUTOMATION_SELECT_PROFILE -- --es profileId nordic-lbs
v2_peri "Start advertising so the iPhone can find it"
v2_broadcast AUTOMATION_START_PERIPHERAL -- --es profileId nordic-lbs

v2_peri "Show logs panel"
v2_broadcast AUTOMATION_SHOW_LOGS

ad_close_peripheral

v2_cent "Open ${CENTRAL_APP_NAME}"
_v2_run_capture run_ios_open_central

v2_cent "Show logs panel"
ios_replay_v2_segment "${AUTO_DIR}/replays/ios/v2-ios-00-show-logs.ad"

v2_cent "Choose Nordic, tap Scan, wait for your device to appear"
ios_replay_v2_segment "${AUTO_DIR}/replays/ios/v2-ios-01-nordic-scan-wait.ad"

v2_cent "Connect, then wait for the link to settle"
ios_replay_v2_segment "${AUTO_DIR}/replays/ios/v2-ios-02-connect-wait.ad"

v2_cent "Turn the LED on"
ios_replay_v2_segment "${AUTO_DIR}/replays/ios/v2-ios-03-led-on.ad"

v2_cent "Turn the LED off"
ios_replay_v2_segment "${AUTO_DIR}/replays/ios/v2-ios-04-led-off.ad"

v2_peri "Update the button state (on, then off)"
v2_broadcast AUTOMATION_BUTTON_ON
v2_broadcast AUTOMATION_BUTTON_OFF

v2_peri "Update battery level (+10 three times, -10 twice)"
v2_broadcast AUTOMATION_BATTERY_PLUS_10
sleep 1
v2_broadcast AUTOMATION_BATTERY_PLUS_10
sleep 1
v2_broadcast AUTOMATION_BATTERY_PLUS_10
sleep 1
v2_broadcast AUTOMATION_BATTERY_MINUS_10
sleep 1
v2_broadcast AUTOMATION_BATTERY_MINUS_10

v2_done "Close automation sessions, stop the central app, and stop the peripheral app"
ble_v2_close_sessions_and_stop_peripheral_app
_E2E_TEARDOWN_DONE=1

_V2_END_EPOCH=$(date +%s)
_V2_ELAPSED=$((_V2_END_EPOCH - _V2_START_EPOCH))
_V2_MINS=$((_V2_ELAPSED / 60))
_V2_SECS=$((_V2_ELAPSED % 60))
printf '\n✅ All steps finished.  Time taken: %dm %02ds\n\n' "${_V2_MINS}" "${_V2_SECS}"
