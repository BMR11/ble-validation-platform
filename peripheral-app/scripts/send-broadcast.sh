#!/bin/bash

# CLI script to send broadcast intents to the example app via ADB
# Usage (from repo root): ./example/scripts/send-broadcast.sh [message]

# Default message if not provided
MESSAGE="${1:-helloWorld}"

# Must match registerBroadcastReceiver in your app (see example/src/App.tsx / send-broadcast.js)
ACTION="com.bleperipheraldemo.CUSTOM_COMMAND"

echo "📡 Sending broadcast intent..."
echo "   Action: $ACTION"
echo "   Message: $MESSAGE"
echo ""

# Send broadcast with message as extra
adb shell am broadcast \
  -a "$ACTION" \
  --es "message" "$MESSAGE" \
  --es "command" "HELLO_WORLD" \
  --ei "timestamp" "$(date +%s)"

echo ""
echo "✅ Broadcast sent! Check your app's debug logs."
