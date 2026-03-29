# BLE Device Emulator Demo

A **profile-driven Bluetooth Low Energy (BLE) device emulator** with a **peripheral** app (GATT server) and a **central** app (scanner / GATT client). Device behavior is defined by **JSON profiles** that can be **bundled locally** or **fetched from a small admin server** (remote-profile).

## Problem

BLE development and QA usually depend on **physical hardware** for every scenario. That is expensive, hard to parallelize, and awkward in CI. Reproducing edge cases (battery drain, error states, Nordic-style LED/button services) requires multiple devices and manual setup.

## Solution

This repo provides:

- **JSON profiles** under [`profiles/local/`](profiles/local/) (and optional remote copies) that describe services, characteristics, advertising, optional state machines, and UI hints.
- A **peripheral** React Native app that loads those profiles (local bundle or HTTP), applies `valueGenerator` expansion, and runs them through `react-native-ble-peripheral-manager` (logic migrated from the upstream example on branch `test-pripheral-config-profile-mar23`).
- A **central** React Native app using `react-native-ble-manager` to scan, connect, subscribe, and write — proving end-to-end communication.
- **`remote-profile/`** — Vite + Express demo for **server-driven profiles**: version, publish, and pull **latest published** JSON by `profileId` into the peripheral without changing app code.

## Local vs remote profiles

| Mode | Source | When to use |
|------|--------|-------------|
| **Local** | `profiles/local/*.json` bundled into the peripheral | Default, offline, CI-friendly baselines |
| **Remote** | `remote-profile` HTTP API (`GET /api/profiles`, `GET /api/profiles/:id/latest`) | Demo central management, version history, publish/draft workflow |

Remote mode uses the **same** `applyValueGenerators` + `ProfileEngine` pipeline as local JSON. Details: [docs/remote-profiles.md](docs/remote-profiles.md).

**Firmware sync** (OTA, auto-import from firmware, etc.) is **not implemented**; it is documented as a future direction in [remote-profile/README.md](remote-profile/README.md).

## Architecture overview

- **Peripheral** (`peripheral-app/`): local bundles from `../profiles/local/*.json` and/or fetches from remote-profile; executes `ProfileEngine`.
- **Central** (`central-app/`): user picks a demo target (heart rate vs Nordic LBS), scans by service UUID, connects, discovers services, subscribes, writes LED for Nordic.
- **Remote-profile** (`remote-profile/`): React admin UI + Express API + JSON file store — see [remote-profile/README.md](remote-profile/README.md).

More detail: [docs/architecture.md](docs/architecture.md).

## Folder structure

```
ble-device-emulator-demo/
  peripheral-app/
  central-app/
  remote-profile/
    client/           # Vite React admin
    server/           # Express API + JSON persistence
  profiles/
    local/            # Bundled JSON (heart-rate, nordic-lbs)
    remote/           # Docs / optional exported samples
  automation/
  docs/
  README.md
```

## Setup

Requirements: **Node 18+**, **JDK 17** (for Android), Xcode + CocoaPods for iOS central builds.

1. **Peripheral**

   ```bash
   cd peripheral-app
   npm install
   cp .env.example .env
   ```

   Edit **`.env`**: set **`REMOTE_PROFILE_LAN_HOST`** for a physical phone on Wi‑Fi (see [docs/remote-profiles.md](docs/remote-profiles.md)). Never commit **`.env`**.

   The app depends on the local library via `file:../../react-native-ble-peripheral-manager` (sibling of this demo folder inside `RN_Ble_Peripheral`).

2. **Central**

   ```bash
   cd central-app
   npm install
   ```

3. **Remote-profile** (optional, for server-driven profiles)

   ```bash
   cd remote-profile/server && npm install && cp .env.example .env && npm run dev
   cd remote-profile/client && npm install && npm run dev
   ```

   Optional **`server/.env`** only overrides `PORT` / `HOST`. Login: `demo@example.com` / `demo123` (public demo only — see [docs/remote-profiles.md](docs/remote-profiles.md)).

4. **iOS (central only, or peripheral if you add iOS usage)**

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
2. **Profile source**: **Local** (default) or **Remote** (requires remote-profile server).
3. For **Remote**: tap **Fetch remote profiles**, then select a row (loads **latest published**).
4. Tap **Start peripheral**.
5. Watch the **log panel** for advertising, service registration, reads/writes, and state transitions.

**Remote API URL** comes from **`peripheral-app/.env`** (`REMOTE_PROFILE_LAN_HOST` or `REMOTE_PROFILE_TUNNEL_BASE`) — see [docs/remote-profiles.md](docs/remote-profiles.md).

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

1. Choose **target profile** (matches `profiles/local/` IDs).
2. **Scan (8s)** — filters by the primary service UUID for that profile.
3. Tap a device row to **connect**.
4. Observe **live metrics** and **logs** (HR + battery, or Nordic button + LED writes).

## Profiles

| File | ID | Advertised name (typical) | Notes |
|------|-----|---------------------------|--------|
| `profiles/local/heart-rate.json` | `heart-rate-monitor` | `RN_BLE_HR_Demo` | HR (0x180D), battery (0x180F), DIS, state machine, `valueGenerator` for HR + battery sim. |
| `profiles/local/nordic-lbs.json` | `nordic-lbs` | `My_LBS` | Nordic LBS UUIDs, button notify, LED write, battery. |

Schema and `valueGenerator` keys: [docs/profile-schema.md](docs/profile-schema.md).

**Remote seeded history** (v1 vs v2 stories) is described in [docs/profile-versioning.md](docs/profile-versioning.md).

## Documentation index

- [docs/remote-profiles.md](docs/remote-profiles.md) — server-driven profile concept and peripheral integration.
- [docs/remote-profile-api.md](docs/remote-profile-api.md) — HTTP API reference.
- [docs/profile-versioning.md](docs/profile-versioning.md) — draft / published / latest rules.
- [docs/demo-flows.md](docs/demo-flows.md) — end-to-end flows.

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
- **Firmware-linked profile rollout**: documented only; see [remote-profile/README.md](remote-profile/README.md).

## License / upstream

Peripheral BLE engine and types are derived from the **`react-native-ble-peripheral-manager`** example (branch `test-pripheral-config-profile-mar23`). This demo repo is standalone; the library source itself is not modified here.

## Git

The repo root is a normal Git working tree (no nested repos under `remote-profile/`). Use **local Git** only as your policy requires; `.gitignore` excludes `node_modules`, build outputs, `remote-profile/server/data/store.json`, and common IDE artifacts.
