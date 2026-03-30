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
CENT_SESSION="${CENT_SESSION_BASE}"
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

# Map a human iOS device name to the UDID agent-device expects. --device "iPhone-RG" can still
# route to a Simulator; --udid from a list row with kind=device forces the physical phone.
ble_resolve_ios_udid_from_name() {
  local want="$1"
  ( cd "${AUTO_DIR}" && "${AD_BASE[@]}" devices --json 2>/dev/null ) | python3 -c '
import json, sys
want = sys.argv[1]
try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(2)
devices = (payload.get("data") or {}).get("devices")
if not isinstance(devices, list):
    devices = payload.get("devices") or []
for dev in devices:
    if dev.get("platform") != "ios" or dev.get("kind") != "device":
        continue
    if dev.get("name") != want:
        continue
    udid = dev.get("id") or dev.get("udid")
    if udid:
        print(udid)
        sys.exit(0)
sys.exit(1)
' "${want}"
}

if [[ -n "${IOS_DEVICE:-}" && -z "${IOS_UDID:-}" ]]; then
  if resolved="$(ble_resolve_ios_udid_from_name "${IOS_DEVICE}")"; then
    IOS_UDID="${resolved}"
    export IOS_UDID
    echo "Resolved IOS_DEVICE='${IOS_DEVICE}' → IOS_UDID=${IOS_UDID} (physical device from agent-device list)" >&2
  else
    echo "Error: IOS_DEVICE='${IOS_DEVICE}' did not match any iOS row with kind=device in agent-device JSON." >&2
    echo "  Unlock the iPhone, trust this Mac, run: (cd ${AUTO_DIR} && npx agent-device devices --json)" >&2
    echo "  Then set IOS_UDID to the physical device's id or fix the device name." >&2
    exit 1
  fi
fi

# agent-device's device resolver treats udid/deviceName/serial as explicit selection; without them it
# prefers a Simulator when both exist. Require a real UDID for this BLE flow unless simulator is intentional.
if [[ "${ALLOW_IOS_SIMULATOR_UNTARGETED:-0}" != "1" && -z "${IOS_UDID:-}" ]]; then
  echo "Error: IOS_UDID is empty after resolution. Physical runs need the UDID from agent-device (kind=device)." >&2
  echo "  cd ${AUTO_DIR} && npx agent-device devices --json  # copy id for your iPhone" >&2
  echo "  Put IOS_UDID=... in automation/.env" >&2
  exit 1
fi

# Unique session per phone so a stale 'ble-demo-central' daemon session cannot keep a Simulator binding.
if [[ -n "${IOS_UDID:-}" ]]; then
  _cent_hash="$(printf '%s' "${IOS_UDID}" | python3 -c 'import sys,hashlib; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest()[:10])')"
  if [[ -n "${_cent_hash}" ]]; then
    CENT_SESSION="${CENT_SESSION_BASE}-${_cent_hash}"
  fi
fi
export CENT_SESSION

run_ad() {
  local platform="$1"
  shift
  local cmd=( "${AD_BASE[@]}" )
  if [[ "${platform}" == "android" && -n "${ANDROID_SERIAL}" ]]; then
    cmd+=(--serial "${ANDROID_SERIAL}")
  fi
  if [[ "${platform}" == "ios" ]]; then
    # Order matters for some CLI paths: platform + target first, then lock + udid (agent-device o7/tt).
    cmd+=(--platform ios --target mobile)
    if [[ -n "${IOS_UDID}" || -n "${IOS_DEVICE}" ]]; then
      cmd+=(--session-lock strip)
    fi
    if [[ -n "${IOS_UDID}" ]]; then
      cmd+=(--udid "${IOS_UDID}")
    elif [[ -n "${IOS_DEVICE}" ]]; then
      cmd+=(--device "${IOS_DEVICE}")
    fi
  fi
  cmd+=("$@")
  "${cmd[@]}"
}

# Android .ad files use "open com.bleperipheraldemo"; substitute release (or custom) package id.
android_replay() {
  local src="$1"
  local tmp
  # macOS mktemp requires the template to end with XXXXXX (no suffix after it).
  tmp="$(mktemp "${TMPDIR:-/tmp}/ble-demo-android-replay.XXXXXX")"
  sed "s/^open com\\.bleperipheraldemo$/open ${ANDROID_PERIPHERAL_PACKAGE}/g" "$src" >"$tmp"
  run_ad android --session "${PERIPH_SESSION}" --platform android replay "$tmp"
  rm -f "$tmp"
}

# The daemon persists named sessions; `open` reuses an existing session's device. Close base name (legacy)
# and the effective session before replays.
echo "== 0a) iOS: close stale central sessions '${CENT_SESSION_BASE}' / '${CENT_SESSION}' if any"
run_ad ios --session "${CENT_SESSION_BASE}" close || true
if [[ "${CENT_SESSION}" != "${CENT_SESSION_BASE}" ]]; then
  run_ad ios --session "${CENT_SESSION}" close || true
fi

echo "== 0) adb (automated): launch peripheral package + BLE permission grants"
if [[ "${SKIP_ADB_BOOTSTRAP:-0}" != "1" ]]; then
  bash "${SCRIPT_DIR}/adb-peripheral-bootstrap.sh"
else
  echo "    (skipped SKIP_ADB_BOOTSTRAP=1)"
fi

echo "== 1) agent-device Android replay: 01-start-nordic-lbs.ad (open → Nordic LBS → Start)"
android_replay "${AUTO_DIR}/replays/android/01-start-nordic-lbs.ad"

echo "== 2) agent-device iOS replay: 02-connect-and-baseline.ad (session=${CENT_SESSION})"
run_ad ios --session "${CENT_SESSION}" replay "${AUTO_DIR}/replays/ios/02-connect-and-baseline.ad"

echo "== 3) agent-device Android replay: 03-toggle-lbs-button.ad"
android_replay "${AUTO_DIR}/replays/android/03-toggle-lbs-button.ad"

echo "== 4) agent-device iOS replay: 04-assert-button-pressed.ad"
run_ad ios --session "${CENT_SESSION}" replay "${AUTO_DIR}/replays/ios/04-assert-button-pressed.ad"

echo "== 5) agent-device Android replay: 05-battery-to-80.ad"
android_replay "${AUTO_DIR}/replays/android/05-battery-to-80.ad"

echo "== 6) agent-device iOS replay: 06-assert-battery-80.ad"
run_ad ios --session "${CENT_SESSION}" replay "${AUTO_DIR}/replays/ios/06-assert-battery-80.ad"

echo "== 7) agent-device: close named sessions"
run_ad android --session "${PERIPH_SESSION}" --platform android close || true
run_ad ios --session "${CENT_SESSION}" close || true

echo "LBS + battery E2E flow finished OK."
