#!/usr/bin/env node

/**
 * CLI script to send broadcast intents to the example app via ADB.
 * Lives under example/scripts/ (example-only tooling).
 *
 * Usage (from repo root):
 *   yarn send-broadcast [args]
 * From example/:
 *   yarn send-broadcast [args]
 * Direct:
 *   node example/scripts/send-broadcast.js [message]
 *
 * Examples:
 *   yarn send-broadcast helloWorld
 *   yarn send-broadcast "Test message" --command START
 *   yarn send-broadcast "Update value" --command UPDATE --value 42
 */

const { execSync } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
let message = 'helloWorld';
let command = 'HELLO_WORLD';
let value = null;
let extraArgs = {};

// Simple argument parser
for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === '--command' && args[i + 1]) {
    command = args[i + 1];
    i++;
  } else if (arg === '--value' && args[i + 1]) {
    value = args[i + 1];
    i++;
  } else if (arg.startsWith('--')) {
    const key = arg.slice(2);
    if (args[i + 1] && !args[i + 1].startsWith('--')) {
      extraArgs[key] = args[i + 1];
      i++;
    }
  } else if (!arg.startsWith('--')) {
    // First non-flag argument is the message
    message = arg;
  }
}

const ACTION = 'com.bleperipheraldemo.CUSTOM_COMMAND';

console.log('📡 Sending broadcast intent...');
console.log(`   Action: ${ACTION}`);
console.log(`   Message: ${message}`);
console.log(`   Command: ${command}`);
if (value) console.log(`   Value: ${value}`);
if (Object.keys(extraArgs).length > 0) {
  console.log(`   Extra args:`, extraArgs);
}
console.log('');

// Build ADB command
let adbCommand = `adb shell am broadcast -a "${ACTION}"`;
adbCommand += ` --es "message" "${message}"`;
adbCommand += ` --es "command" "${command}"`;
adbCommand += ` --ei "timestamp" ${Math.floor(Date.now() / 1000)}`;

if (value !== null) {
  // Try to determine if it's a number
  if (!isNaN(value)) {
    adbCommand += ` --ei "value" ${value}`;
  } else {
    adbCommand += ` --es "value" "${value}"`;
  }
}

// Add extra arguments
for (const [key, val] of Object.entries(extraArgs)) {
  if (!isNaN(val)) {
    adbCommand += ` --ei "${key}" ${val}`;
  } else {
    adbCommand += ` --es "${key}" "${val}"`;
  }
}

try {
  execSync(adbCommand, { stdio: 'inherit' });
  console.log('');
  console.log("✅ Broadcast sent! Check your app's debug logs.");
} catch (error) {
  console.error('');
  console.error('❌ Failed to send broadcast:', error.message);
  console.error('');
  console.error('Make sure:');
  console.error('  1. ADB is installed and in your PATH');
  console.error('  2. Your Android device/emulator is connected');
  console.error('  3. USB debugging is enabled');
  process.exit(1);
}
