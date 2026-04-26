<p align="center">
  <img src="docs/images/ble-validation-platform-logo.png" alt="BLE validation platform logo" width="400" />
</p>

# ble-validation-platform

Profile-driven BLE simulation, fault injection, and validation platform for connected systems.
It includes a React Native **peripheral** app (GATT server), a React Native **central** app (scanner / GATT client), reusable **JSON device profiles**, and local or remote profile loading over real BLE communication.

## 🚀 Why this exists

BLE work often depends on the right hardware, firmware version, and device state all being available at once.

That slows down mobile, firmware, and QA teams when each group is waiting on the others. The hardest bugs are often timing or state issues that only show up during real central/peripheral interaction.

This project gives teams a way to define those behaviors explicitly, reproduce them, and validate the app-device boundary earlier.

It is the implementation behind the 3-part BLE Validation Platform series:

- [Part 1: Stop Waiting for Hardware](https://medium.com/@rajnibhaimgediya/stop-waiting-for-hardware-rethinking-how-we-build-and-validate-ble-systems-65d22a8b5871)
- [Part 2: Designing Profile-Driven BLE Systems](https://medium.com/@rajnibhaimgediya/designing-profile-driven-ble-systems-architecture-and-execution-1ba02f94a73e)
- [Part 3: From Simulation to Validation](https://medium.com/@rajnibhaimgediya/from-simulation-to-validation-building-reliable-ble-systems-at-scale-12ede42a1f5c)

## 🎯 What this enables

- simulate BLE peripherals before hardware is ready
- inject repeatable failure and edge-case scenarios
- validate central app behavior end-to-end over real BLE

## Overview

This repository provides a **reference implementation of a profile-driven BLE validation platform**.

It demonstrates how Bluetooth Low Energy (BLE) device behavior can be simulated, fault conditions can be injected, and system behavior can be validated end-to-end using real mobile applications.

The goal is not to replace physical hardware testing. It is to reduce how often development and validation are blocked by hardware availability, while still using real BLE communication.

This work is informed by real-world experience building and validating BLE-enabled systems in production environments.

## Problem

BLE development and QA usually depend on **physical hardware** for every scenario. That is expensive, hard to parallelize, and awkward in CI. Reproducing edge cases such as battery drain, error states, or Nordic-style LED/button services often requires multiple devices and manual setup.

Additional challenges include:

- Hardware-in-the-loop (HIL) setups are costly and difficult to scale
- Development is blocked when firmware/hardware is not ready (prototype / EVT phases)
- Parallel validation across multiple devices is limited
- Failure scenarios are difficult to reproduce deterministically

## What this project does

- Defines BLE devices through reusable JSON profiles
- Runs profile-driven behavior on a real BLE peripheral
- Uses real BLE communication between central and peripheral apps
- Recreates validation scenarios that are hard to reproduce with hardware alone
- Supports both local bundled profiles and remotely managed profile versions

## Solution

This repo provides:

- **JSON profiles** under [`profiles/local/`](profiles/local/) (and optional remote copies) that describe services, characteristics, advertising, optional state machines, and UI hints.
- A **peripheral** React Native app that loads those profiles (local bundle or HTTP), applies `valueGenerator` expansion, and runs them through `rn-ble-peripheral-module` (logic migrated from the upstream example on branch `test-pripheral-config-profile-mar23`).
- A **central** React Native app using `react-native-ble-manager` to scan, connect, read **Device Information Service (DIS)** fields, subscribe, and write (Nordic LED) — proving end-to-end communication.
- **`remote-profile/`** — Vite + Express demo for **server-driven profiles**: version, publish, and pull **latest published** JSON by `profileId` into the peripheral without changing app code.

This repository demonstrates a **platform-oriented approach** for BLE simulation and validation.

It enables:

### 🚀 Faster Development

- Simulate BLE peripherals even when firmware/hardware is not ready
- Enables early integration during prototype and EVT phases

### 🧪 Scalable QA & Validation

- Run multiple simulated peripherals on commodity devices (Android/iOS/Mac)
- Enables parallel testing without complex hardware setups

### 💰 Reduced Cost of HIL (hardware-in-the-loop) testing

- Eliminates dependency on expensive physical setups
- Uses existing mobile devices to emulate BLE peripherals

### 🔍 Improved Debugging

- On-device logs provide visibility into BLE communication
- Helps diagnose issues in real-time

### ⚡ Flexible Device Modeling

- Profile-driven system allows:
  - switching between device types
  - testing multiple configurations using the same app

## 🧭 Where to start

- New to the idea? Start with [Part 1](https://medium.com/@rajnibhaimgediya/stop-waiting-for-hardware-rethinking-how-we-build-and-validate-ble-systems-65d22a8b5871).
- Thinking about architecture? Read [Part 2](https://medium.com/@rajnibhaimgediya/designing-profile-driven-ble-systems-architecture-and-execution-1ba02f94a73e).
- Focused on testing and validation? Read [Part 3](https://medium.com/@rajnibhaimgediya/from-simulation-to-validation-building-reliable-ble-systems-at-scale-12ede42a1f5c).

Then run the demo flow in this README to see a central app connect to a profile-driven peripheral over BLE.

## How it works

The platform follows a simple flow:

```text
profile -> execution engine -> BLE peripheral -> central app interaction
```

A profile describes the device name, services, characteristics, values, generators, and optional state behavior.

The peripheral app loads that profile, expands dynamic values, and exposes the result through the device BLE stack. The central app scans, connects, reads, subscribes, and writes as it would with a physical device.

This is not a mock API. The interaction still goes through real BLE communication.

## Community insights

In practice, BLE teams rarely choose between only mocks or only hardware. Most need a mix.

Mocks are fast and useful for app logic, but they do not exercise the BLE stack. Hardware gives the most realistic signal, but it is hard to scale and hard to force into every edge case. A profile-driven peripheral sits between those worlds: controllable enough for repeatable validation, but still close to real BLE behavior.

One practical challenge is keeping simulation aligned with firmware as services, characteristics, and behavior evolve. This repo includes local profiles and a remote profile demo to explore that problem, but firmware-profile sync is still a future direction.

The hardest issues usually appear at the boundary between mobile and firmware: timing, reconnects, notification behavior, writes that trigger state changes, and data that changes while the app is moving between screens. This project is designed to make those interactions easier to reproduce and discuss.

## What is included

- **`profiles/local/`**: bundled JSON profiles for demo devices.
- **`peripheral-app/`**: React Native GATT server that executes profiles using `rn-ble-peripheral-module`.
- **`central-app/`**: React Native BLE central app using `react-native-ble-manager`.
- **`remote-profile/`**: Vite + Express demo for versioned, server-driven profiles.
- **`docs/`**: architecture notes, profile schema, remote profile docs, and demo flows.

## Validation scenarios

The platform can model scenarios that are difficult to repeat manually:

- changing sensor values
- battery drain and low battery states
- sudden disconnects
- delayed or abnormal notifications
- protocol inconsistencies or unexpected values
- interaction-driven behavior such as LED writes or button notifications

These scenarios help validate how a central app behaves before every case is available on real hardware.

## Failure & Edge Case Testing

The platform enables controlled simulation of scenarios that are difficult to reproduce using real hardware:

- sudden disconnections
- battery drain and low battery states
- RSSI fluctuations
- high-frequency or abnormal notifications
- protocol inconsistencies or invalid data

These scenarios help validate how central applications behave under real-world failure conditions.

## 🔄 Advanced Validation Scenarios

This approach supports testing of complex BLE workflows, including:

- Over-the-Air (OTA) firmware update flows
- reconnection and recovery handling
- real-time data streaming validation
- stress testing under abnormal device behavior

## Local vs remote profiles

| Mode | Source | When to use |
|------|--------|-------------|
| **Local** | `profiles/local/*.json` bundled into the peripheral | Default, offline, CI-friendly baselines |
| **Remote** | `remote-profile` HTTP API (`GET /api/profiles`, `GET /api/profiles/:id/latest`) | Demo central management, version history, publish/draft workflow |

Remote mode uses the **same** `applyValueGenerators` + `ProfileEngine` pipeline as local JSON. Details: [docs/remote-profiles.md](docs/remote-profiles.md).

**Firmware sync** (OTA, auto-import from firmware, etc.) is **not implemented**; it is documented as a future direction in [remote-profile/README.md](remote-profile/README.md).

## 📚 Articles & Deep Dives

This project is accompanied by a series of detailed technical articles:

- [Stop Waiting for Hardware: Rethinking BLE Development](https://medium.com/@rajnibhaimgediya/stop-waiting-for-hardware-rethinking-how-we-build-and-validate-ble-systems-65d22a8b5871)  
- [Designing Profile-Driven BLE Systems](https://medium.com/@rajnibhaimgediya/designing-profile-driven-ble-systems-architecture-and-execution-1ba02f94a73e)  
- [From Simulation to Validation: Building Reliable BLE Systems](https://medium.com/@rajnibhaimgediya/from-simulation-to-validation-building-reliable-ble-systems-at-scale-12ede42a1f5c)  

These articles explain the **architecture, motivation, and real-world use cases** behind this platform.


## Architecture overview

<img width="2561" height="1471" alt="ble-excalidraw" src="https://github.com/user-attachments/assets/0a2f40d6-ac44-4dff-8358-fde33ff34f16" />



- **Peripheral** (`peripheral-app/`): local bundles from `../profiles/local/*.json` and/or fetches from remote-profile; executes `ProfileEngine`.
- **Central** (`central-app/`): user picks a demo target (heart rate vs Nordic LBS), scans by service UUID, connects, reads DIS into an expandable **Info** panel, discovers services, subscribes, writes LED for Nordic.
- **Remote-profile** (`remote-profile/`): React admin UI + Express API + JSON file store — see [remote-profile/README.md](remote-profile/README.md).

More detail: [docs/architecture.md](docs/architecture.md).

## Folder structure

```text
ble-validation-platform/
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

   Edit **`.env`**: set **`REMOTE_PROFILE_LAN_HOST`** for a physical phone on Wi‑Fi (see [docs/remote-profiles.md](docs/remote-profiles.md)). Never commit **`.env`**. After changing **`.env`**, restart Metro; use `yarn start --reset-cache` or `npm start -- --reset-cache` if the remote URL still looks wrong.

   The app depends on the local library via `file:../local_modules/rn-ble-peripheral-module` (from `peripheral-app/`).

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
3. Tap a device row to **connect** (scan stops; **target** and **Scan** stay disabled until you disconnect).
4. Expand **Info** on the device card to see **DIS** strings (manufacturer, model, serial, firmware, etc.) when the peripheral exposes them.
5. Observe **live metrics** and **logs** (HR + battery, or Nordic button + **LED ON** / **LED OFF** writes).

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
3. Confirm **notifications**, optional **Info (DIS)**, and **LED ON** then **LED OFF** (Nordic) in UI and logs.

https://github.com/user-attachments/assets/f006b81c-21bd-40e6-8a2f-f46200ce6cea

## Use cases

- **BLE testing** — repeatable peripheral behavior without custom firmware.
- **IoT development** — prototype how apps react to standard and vendor-specific GATT layouts.
- **Medical / wearable validation** — exercise Heart Rate profile–style services and state transitions in a controlled way (not for clinical certification; demo/education only).

## 🌍 Applicability

This approach is applicable across industries that rely on BLE-connected systems, including:

- healthcare and medical devices
- wearable technology
- IoT platforms
- industrial and sensor systems

## ⚠️ Disclaimer

This platform is intended for **development, simulation, and validation workflows**, and is not a substitute for testing with real hardware devices.

While it enables controlled simulation of BLE behavior and failure scenarios, **final validation with actual devices remains essential**, especially for production and regulated environments.

This approach is designed to complement traditional hardware-based testing by:

- enabling earlier development and integration
- improving test coverage through reproducible scenarios
- reducing dependency on physical setups during development and QA

## 🔮 Future direction

- **Automation**: Orchestrate both central and peripheral apps and validate behavior end-to-end using tools like [Agent Device (Callstack)](https://github.com/callstack/agent-device), enabling repeatable and scalable BLE validation workflows.

- **Firmware–Profile Sync Platform**: Enable automatic synchronization between device firmware and BLE profiles. Changes to services or characteristics in firmware (e.g., via pull requests) can trigger a CI-integrated webhook pipeline that updates or generates corresponding profiles in the remote-profile system, keeping simulated devices aligned with real firmware behavior.

- **Drag-and-Drop Profile Builder**: Provide a UI-based workflow to create and modify BLE profiles without code, reducing the barrier to entry for QA and cross-functional teams.

- **Telemetry & AI-Driven Profile Generation**: Capture real-world BLE communication traces between central and peripheral devices and use them to generate reusable profiles. Future enhancements may leverage AI/ML techniques to infer device behavior patterns, simulate realistic edge cases, and automatically adapt profiles based on observed system behavior.

- **Cloud Profile Registry**: Introduce a centralized, versioned registry for BLE profiles with access control, enabling teams to share, reuse, and manage device definitions across environments.

- **Advanced OTA Simulation**: Extend the platform to simulate firmware update workflows and edge cases, enabling validation of OTA pipelines without requiring actual hardware updates.

## License / upstream

Peripheral BLE engine and types live in the vendored **`rn-ble-peripheral-module`** package under [`local_modules/rn-ble-peripheral-module`](local_modules/rn-ble-peripheral-module).

## ⭐ Support

If this project helps you:

- ⭐ Star the repo
- 🧪 Try it in your workflow
- 🤝 Share feedback

This helps make BLE development more accessible and scalable.

That helps keep the examples grounded in the problems BLE teams actually run into.
