#!/usr/bin/env bash
# Send a single automation broadcast to peripheral-app (Android).
# Uses action com.bleperipheraldemo.CUSTOM_COMMAND and extras expected by ProfileApp.
#
# Usage:
#   adb-send-automation-broadcast.sh TRG_COMMAND [-- extra adb args...]
#
# Examples:
#   adb-send-automation-broadcast.sh TRG_SELECT_LOCAL_PROFILE
#   adb-send-automation-broadcast.sh TRG_SELECT_PROFILE -- --es profileId nordic-lbs
#   adb-send-automation-broadcast.sh TRG_START_PERIPHERAL -- --es profileId nordic-lbs
#
# Env: ANDROID_SERIAL, ANDROID_PERIPHERAL_PACKAGE (default com.bleperipheraldemo)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=../load-automation-env.sh
source "${SCRIPT_DIR}/../load-automation-env.sh"
ble_automation_load_automation_env "${AUTO_DIR}"

CMD="${1:-}"
if [[ -z "${CMD}" ]]; then
  echo "Usage: $0 TRG_COMMAND [-- extra am broadcast flags]" >&2
  exit 1
fi
shift

EXTRA_ARGS=()
if [[ "${1:-}" == "--" ]]; then
  shift
  EXTRA_ARGS=("$@")
fi

PKG="${ANDROID_PERIPHERAL_PACKAGE:-com.bleperipheraldemo}"
ACTION="com.bleperipheraldemo.CUSTOM_COMMAND"

_adb() {
  if [[ -n "${ANDROID_SERIAL:-}" ]]; then
    adb -s "${ANDROID_SERIAL}" "$@"
  else
    adb "$@"
  fi
}

# shellcheck disable=SC2207
_ts="$(date +%s)"
# With `set -u`, an empty EXTRA_ARGS=() can make "${EXTRA_ARGS[@]}" error on some bash builds.
if [[ ${#EXTRA_ARGS[@]} -gt 0 ]]; then
  _adb shell am broadcast -p "${PKG}" -a "${ACTION}" \
    --es command "${CMD}" \
    --es message "automation" \
    --ei timestamp "${_ts}" \
    "${EXTRA_ARGS[@]}"
else
  _adb shell am broadcast -p "${PKG}" -a "${ACTION}" \
    --es command "${CMD}" \
    --es message "automation" \
    --ei timestamp "${_ts}"
fi
