# shellcheck shell=bash
# Load a single env file: KEY=value lines only; skips blank lines and # comments.
# Does not override variables already present in the environment (shell / CI wins).
ble_automation_load_env() {
  local env_file="$1"
  local line key val
  [[ -f "$env_file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    case "$line" in
      ''|'#'*) continue ;;
    esac
    key="${line%%=*}"
    val="${line#*=}"
    key="$(echo "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    val="$(echo "$val" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    [[ -z "$key" ]] && continue
    # shellcheck disable=SC2016
    if eval '[ -z "${'"$key"'+x}" ]'; then
      export "$key=$val"
    fi
  done < "$env_file"
}

# Load automation config from one place: optional automation/.env (gitignored), then
# automation/.env.example (committed defaults). Order lets a minimal .env override only
# what you need; unset keys fall through to .env.example. Shell / CI exports still win.
#
# After loading, sets canonical app display names for agent-device / replays:
#   CENTRAL_APP_NAME   — iOS Springboard label (env: CENTRAL_APP_NAME or legacy IOS_CENTRAL_DISPLAY_NAME)
#   PERIPHERAL_APP_NAME — Android launcher title in replay `open "…"` (env: PERIPHERAL_APP_NAME or legacy ANDROID_PERIPHERAL_OPEN_DISPLAY)
ble_automation_load_automation_env() {
  local automation_dir="$1"
  ble_automation_load_env "${automation_dir}/.env"
  ble_automation_load_env "${automation_dir}/.env.example"
  export CENTRAL_APP_NAME="${CENTRAL_APP_NAME:-${IOS_CENTRAL_DISPLAY_NAME:-Central App}}"
  export PERIPHERAL_APP_NAME="${PERIPHERAL_APP_NAME:-${ANDROID_PERIPHERAL_OPEN_DISPLAY:-Peripheral App}}"
}
