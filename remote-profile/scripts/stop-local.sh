#!/usr/bin/env bash
# Stop dev listeners for remote-profile (API 4050, Vite 5174).
set -e
for port in 4050 5174; do
  pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo "Stopping port $port (PIDs: $pids)"
    kill $pids 2>/dev/null || true
  fi
done
echo "Done. Ports 4050 and 5174 should be free (check: lsof -i :4050)." 
