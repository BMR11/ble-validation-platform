# shellcheck shell=bash
# Load automation/.env: KEY=value lines only; skips blank lines and # comments.
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
