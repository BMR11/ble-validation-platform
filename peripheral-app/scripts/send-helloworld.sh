#!/bin/bash

# Simple ADB script to send "helloworld" broadcast
# This will appear in the app's debug logs

adb shell am broadcast -a com.bleperipheralmanager.example.CUSTOM_COMMAND \
  --es "command" "helloworld" \
  --es "message" "Hello World from ADB!"

echo "✅ Broadcast sent! Check your app's debug logs."
