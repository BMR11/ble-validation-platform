# BLE Device Emulator Demo

A **profile-driven Bluetooth Low Energy (BLE) device emulator** with a **peripheral** app (GATT server) and a **central** app (scanner / GATT client), sharing JSON profiles from a single folder.

## Problem

BLE development and QA usually depend on **physical hardware** for every scenario. That is expensive, hard to parallelize, and awkward in CI. Reproducing edge cases (battery drain, error states, Nordic-style LED/button services) requires multiple devices and manual setup.

## Solution

This repo provides:

- **JSON profiles** (`profiles/`) that describe services, characteristics, advertising, optional state machines, and UI hints.
- A **peripheral** React Native app that loads those profiles and runs them through `react-native-ble-peripheral-manager` (logic migrated from the upstream example on branch `test-pripheral-config-profile-mar23`).
- A **central** React Native app using `react-native-ble-manager` to scan, connect, subscribe, and write — proving end-to-end communication.
- A small **`valueGenerator`** map in TypeScript that expands compact JSON into full simulation definitions (see `docs/profile-schema.md`).

## Architecture overview

- **Peripheral** (`peripheral-app/`): loads `../profiles/*.json`, applies `valueGenerator` expansion, executes `ProfileEngine` (GATT + advertising + simulations + state machine).
- **Central** (`central-app/`): user picks a demo target (heart rate vs Nordic LBS), scans by service UUID, connects, discovers services, subscribes to notifications, writes LED for Nordic.
- **Profiles** (`profiles/`): single source of truth for peripheral behavior; central targets are documented to match the same UUIDs and names.

More detail: [docs/architecture.md](docs/architecture.md).

## Folder structure

```
ble-device-emulator-demo/
  peripheral-app/     # Android-focused peripheral (react-native-ble-peripheral-manager)
  central-app/        # iOS/Android central (react-native-ble-manager)
  profiles/           # heart-rate.json, nordic-lbs.json
  automation/         # Placeholder for future Agent Device / E2E automation
  docs/               # architecture, schema, demo flows
  README.md
```

## Setup

Requirements: **Node 18+**, **JDK 17** (for Android), Xcode + CocoaPods for iOS central builds.

1. **Peripheral**

   ```bash
   cd peripheral-app
   npm install
   ```

   The app depends on the local library via `file:../../react-native-ble-peripheral-manager` (sibling of this demo folder inside `RN_Ble_Peripheral`).

2. **Central**

   ```bash
   cd central-app
   npm install
   ```

3. **iOS (central only, or peripheral if you add iOS usage)**

   ```bash
   cd central-app/ios && bundle install && bundle exec pod install && cd ../..
   ```

## Running peripheral-app

```bash
cd peripheral-app
npm start
# Android (separate terminal)
npm run android
```

Flow:

1. Grant Bluetooth permissions (Android 12+: advertise + connect).
2. **Select profile** (Heart Rate Monitor or Nordic LED Button Service).
3. Tap **Start peripheral**.
4. Watch the **log panel** for advertising, service registration, reads/writes, and state transitions.

## Running central-app

```bash
cd central-app
npm install
# iOS only — once per clone / native dependency change:
npm run pod-install
npm start
npm run android
# iOS (simulator example; physical device needs a signing Team in Xcode)
npm run ios -- --simulator "iPhone 16"
```

See [central-app/README.md](central-app/README.md) for CocoaPods locale issues, **`BleCentralDemo.xcworkspace`**, and **Signing & Capabilities** on a real iPhone.

Flow:

1. Choose **target profile** (matches `profiles/` IDs).
2. **Scan (8s)** — filters by the primary service UUID for that profile.
3. Tap a device row to **connect**.
4. Observe **live metrics** and **logs** (HR + battery, or Nordic button + LED writes).

## Profiles

| File | ID | Advertised name (typical) | Notes |
|------|-----|---------------------------|--------|
| `profiles/heart-rate.json` | `heart-rate-monitor` | `RN_BLE_HR_Demo` | HR (0x180D), battery (0x180F), DIS, state machine, `valueGenerator` for HR + battery sim. |
| `profiles/nordic-lbs.json` | `nordic-lbs` | `My_LBS` | Nordic LBS UUIDs, button notify, LED write, battery. |

Schema and `valueGenerator` keys: [docs/profile-schema.md](docs/profile-schema.md).

## Demo flow (end-to-end)

See step-by-step instructions for two phones and optional error-state testing in [docs/demo-flows.md](docs/demo-flows.md).

Short version:

1. Start **peripheral-app** → select profile → **Start peripheral**.
2. Start **central-app** → matching target → **Scan** → **Connect**.
3. Confirm **notifications** (and **LED writes** for Nordic) in UI and logs.

## Use cases

- **BLE testing** — repeatable peripheral behavior without custom firmware.
- **IoT development** — prototype how apps react to standard and vendor-specific GATT layouts.
- **Medical / wearable validation** — exercise Heart Rate profile–style services and state transitions in a controlled way (not for clinical certification; demo/education only).

## Future direction

- **Automation**: orchestrate both apps and assert logs/UI via [Agent Device (Callstack)](https://github.com/callstack/agent-device) or similar; see [automation/README.md](automation/README.md).

## License / upstream

Peripheral BLE engine and types are derived from the **`react-native-ble-peripheral-manager`** example (branch `test-pripheral-config-profile-mar23`). This demo repo is standalone; the library source itself is not modified here.

## Git

A **local** Git repository is initialized in this folder with a React Native–oriented `.gitignore`. **Nothing is pushed to remotes** as part of this project setup.

## ⭐ Support
If this project helps you:
- ⭐ Star the repo
- 🧪 Try it in your workflow
- 🤝 Share feedback
This helps make BLE development more accessible and scalable.
