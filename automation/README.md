# Automation (agent-device + adb)

End-to-end validation for the BLE demo using [agent-device](https://github.com/callstackincubator/agent-device) (Callstack) on **iOS central-app** and **Android peripheral-app**, plus **adb** for launching the peripheral and granting Bluetooth permissions.

## What this automation checks

1. **Nordic LBS (LED Button Service)**: The peripheral toggles the **button** characteristic; after the toggle, **central-app** must show `Button: Pressed` (baseline is `Button: Released`).
2. **Battery service**: The peripheral raises **Battery Level** from the bundled profile default **50%** to **80%** (three × +10 on the slider); **central-app** must show `Battery: 80%`.

---

## Part 1 — One-time machine setup

### 1.1 Install system tooling

- **macOS** is assumed (iOS builds + typical Android tooling). Install:
  - **Xcode** (for iOS simulator/device and `xcodebuild`).
  - **Android platform tools** so `adb` is on your `PATH` ([Android Studio](https://developer.android.com/studio) or standalone SDK).
  - **Node.js 18+** ([nodejs.org](https://nodejs.org/) or `nvm`).

### 1.2 Install and trust agent-device

- Read the official intro: [agent-device documentation](https://incubator.callstack.com/agent-device/docs/introduction).
- On first use, macOS may prompt for **Accessibility** and related permissions for the helper that drives simulators/devices—approve those or UI automation will fail silently.
- This repo pins the CLI under `automation/node_modules` (see Part 2). You can also install globally: `npm install -g agent-device`.

### 1.3 Build and install both apps

Do this once per device (or when native code changes).

| App | Path | Typical install |
|-----|------|-----------------|
| **Peripheral** | `peripheral-app/` | `cd peripheral-app && npx react-native run-android` (USB device or emulator) |
| **Central** | `central-app/` | `cd central-app && npx react-native run-ios --device "Your iPhone"` (or `--simulator "iPhone 16"` only if BLE works in your setup) |

**Important:** This flow needs a **real Bluetooth link** between peripheral and central in almost all cases. Use a **physical Android phone** as peripheral and a **physical iPhone** as central unless you know your emulator/simulator supports BLE for both roles.

- Android package for adb: `com.bleperipheraldemo`.
- iOS bundle ID for `open` in replays: `org.reactjs.native.example.BleCentralDemo`.

---

## Part 2 — Automation folder setup (every clone)

From the **repository root**:

```bash
cd automation
npm install
```

This installs `agent-device` into `automation/node_modules`. The orchestrator runs it via `npx --prefix "$(pwd)" agent-device`.

---

## Part 3 — Before each run: devices and Bluetooth

### 3.1 Android (peripheral)

1. Enable **Developer options** and **USB debugging**.
2. Connect USB (or use a single emulator if applicable).
3. Confirm the device is visible:

   ```bash
   adb devices
   ```

   You should see `device` (not `unauthorized`). If you have **multiple** devices, note the serial column; you will pass it as `ANDROID_SERIAL` (see Part 5).

4. Turn **Bluetooth ON** on the phone.

### 3.2 iOS (central)

1. Connect the iPhone via USB (or select a simulator only if BLE is valid for you).
2. Trust the computer if prompted.
3. Turn **Bluetooth ON**.
4. List targets for agent-device (pick UDID if you have several simulators/devices):

   ```bash
   cd automation
   npx agent-device devices
   ```

   Copy the **UDID** for your iPhone if needed; set `IOS_UDID` when you run (Part 5).

### 3.3 Physical placement

- Keep the two devices **within normal BLE range** (meters, not rooms away).
- Accept any **first-launch Bluetooth / permission** dialogs on both apps before relying on full automation; you can re-run after that.

---

## Part 4 — Full automated run (recommended)

### 4.1 Command

From the **`automation`** directory:

```bash
cd automation
npm run e2e:lbs-battery
```

Or directly:

```bash
cd automation
bash scripts/run-lbs-battery-e2e.sh
```

### 4.2 What each step does (detailed)

The script `scripts/run-lbs-battery-e2e.sh` runs **named sessions** so Android and iOS do not share one session: default names are `ble-demo-peripheral` and `ble-demo-central` (overridable via env vars).

| Step | Name | What happens |
|------|------|----------------|
| **0** | adb bootstrap | Runs `scripts/adb-peripheral-bootstrap.sh`: `adb wait-for-device`, best-effort `pm grant` for Bluetooth-related permissions on `com.bleperipheraldemo`, then `am start` to launch the peripheral app. Skip with `SKIP_ADB_BOOTSTRAP=1` if the app is already running and permissions are OK. |
| **1** | Android replay `01-start-nordic-lbs.ad` | **agent-device** (Android session) opens the peripheral app, selects the **Nordic LBS** profile card (`peripheral-profile-nordic-lbs`), taps **Start peripheral**, and waits for advertising to settle. The advertised name matches central expectations (**My_LBS**). |
| **2** | iOS replay `02-connect-and-baseline.ad` | **agent-device** (iOS session) opens **BLE Central Demo**, selects target **Nordic LBS**, runs **Scan (8s)**, taps the row labeled **Central device My_LBS**, waits for GATT setup, then asserts on-screen text **Button: Released** and **Battery: 50%**. |
| **3** | Android replay `03-toggle-lbs-button.ad` | Brings Android back to foreground, scrolls to the LBS **Button** switch, toggles it so the peripheral sends a **pressed** notification. |
| **4** | iOS replay `04-assert-button-pressed.ad` | Brings the central app to foreground and asserts **Button: Pressed** is visible. |
| **5** | Android replay `05-battery-to-80.ad` | Opens peripheral, scrolls to the **Battery** slider control, taps **+10** three times (50 → 60 → 70 → 80). |
| **6** | iOS replay `06-assert-battery-80.ad` | Brings central to foreground and asserts **Battery: 80%** is visible. |
| **7** | Close sessions | Calls `agent-device close` for both named sessions (failures ignored so cleanup still runs). |

If any replay fails, the script exits with a non-zero status at the failing command; fix the issue (Part 7) and re-run from the start.

---

## Part 5 — Environment variables (optional)

Set these in the shell **before** `npm run e2e:lbs-battery`:

| Variable | When to use |
|----------|-------------|
| `ANDROID_SERIAL` | Multiple Android devices connected; set to the serial from `adb devices`. |
| `IOS_UDID` | Multiple iOS simulators/devices; set to the UDID from `npx agent-device devices`. |
| `PERIPH_SESSION` | Change the Android named session (default `ble-demo-peripheral`) if it collides with another run. |
| `CENT_SESSION` | Change the iOS named session (default `ble-demo-central`). |
| `SKIP_ADB_BOOTSTRAP=1` | Skip step 0 if you already launched the peripheral and granted permissions. |

**Example:**

```bash
cd automation
export ANDROID_SERIAL=RFCX41ABCDE
export IOS_UDID=00008140-001A248E1E40801C
npm run e2e:lbs-battery
```

---

## Part 6 — Run pieces manually (debugging)

### 6.1 adb only (launch peripheral)

From `automation`:

```bash
./scripts/adb-peripheral-bootstrap.sh
```

### 6.2 Single agent-device replay

Always run from the **`automation`** directory so paths resolve. Use the same `--session` names if you want to reuse state across commands.

**Android example:**

```bash
cd automation
npx agent-device --session ble-demo-peripheral --platform android replay replays/android/01-start-nordic-lbs.ad
```

**iOS example:**

```bash
cd automation
npx agent-device --session ble-demo-central --platform ios replay replays/ios/02-connect-and-baseline.ad
```

Repeat steps in the same order as Part 4.2 if you are debugging a single stage.

---

## Part 7 — Troubleshooting

| Symptom | What to try |
|---------|-------------|
| **No devices in `adb devices`** | USB cable, debugging authorization, correct mode on phone. |
| **Scan finds nothing on central** | Confirm step 1 completed; peripheral must advertise **My_LBS**; wait longer and edit `wait` durations in `replays/ios/02-connect-and-baseline.ad` if links are slow. |
| **Connect fails or metrics stay `--`** | BLE range, pairing/OS prompts, or peripheral not in the correct profile state; run peripheral manually once to verify. |
| **Selector / `find text` fails** | UI or RN version may have changed; use `agent-device snapshot` on the device to inspect the tree, or `agent-device replay -u path/to/file.ad` to refresh selectors ([replay maintenance](https://github.com/callstackincubator/agent-device)). |
| **iOS Bluetooth permission alert** | Dismiss manually once, or automate with agent-device `alert` / `settings` per their docs. |
| **Wrong Android phone targeted** | Set `ANDROID_SERIAL`. |

---

## Stable selectors (reference)

Used by the `.ad` files under `replays/`:

- **Peripheral:** `peripheral-profile-nordic-lbs`, `peripheral-start`, `peripheral-char-2a19-slider-plus-step`, LBS switch `id=peripheral-char-000015241212efde1523785feabcd123-switch`.
- **Central:** `central-target-nordic-lbs`, `central-scan`, `label="Central device My_LBS"`, `central-metric-button`, `central-metric-battery`.

---

## Replay file index

| Step | File |
|------|------|
| Android: start Nordic LBS | `replays/android/01-start-nordic-lbs.ad` |
| iOS: connect + baseline | `replays/ios/02-connect-and-baseline.ad` |
| Android: toggle button | `replays/android/03-toggle-lbs-button.ad` |
| iOS: assert pressed | `replays/ios/04-assert-button-pressed.ad` |
| Android: battery → 80% | `replays/android/05-battery-to-80.ad` |
| iOS: assert 80% | `replays/ios/06-assert-battery-80.ad` |
