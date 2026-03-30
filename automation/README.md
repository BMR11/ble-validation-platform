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

- Android **application id**: **debug** `com.bleperipheraldemo` · **release** (this repo) `com.bleperipheraldemo.release` — set `ANDROID_PERIPHERAL_PACKAGE` when using release (see Part 1.4).
- iOS bundle ID for `open` in replays: `org.reactjs.native.example.BleCentralDemo` (same for Debug and typical Release).

### 1.4 First-time checklist: release builds + when each app runs

**What you do before automation**

1. **Build and install both apps** on the two devices (USB is only required for install and for `adb` / Xcode tooling; BLE works over the air after that).
2. **Turn Bluetooth on** on both phones.
3. **Install automation deps** (`cd automation && npm install`).
4. **Complete agent-device + macOS permissions** once (Accessibility, etc.) per [their docs](https://incubator.callstack.com/agent-device/docs/introduction).

**You do not choose “run iOS first or Android first” by hand** for the full suite: `run-lbs-battery-e2e.sh` already runs steps in the right order (peripheral must be advertising before the central scans). It alternates platforms like this: start peripheral → central connects and checks baseline → peripheral toggles button → central asserts → peripheral changes battery → central asserts.

**Android peripheral — release APK**

From `peripheral-app/android` (with JS deps already installed in `peripheral-app/`):

```bash
cd peripheral-app/android
./gradlew assembleRelease --no-daemon
```

Install the APK (path may match `app/build/outputs/apk/release/blep-example-release-*.apk`):

```bash
adb install -r app/build/outputs/apk/release/blep-example-release-*.apk
```

For automation and adb grants, set:

```bash
export ANDROID_PERIPHERAL_PACKAGE=com.bleperipheraldemo.release
```

**iOS central — Release on a physical iPhone**

From `central-app/` (after `npm install` / `yarn` and `pod install` per `central-app/README.md`):

- **Xcode:** open `central-app/ios/BleCentralDemo.xcworkspace`, select scheme **BleCentralDemo**, configuration **Release**, your team/signing, run on the device.

  or

- **CLI (example):**

  ```bash
  cd central-app
  npx react-native run-ios --mode Release --device "Your iPhone Name"
  ```

**Open each app once manually (recommended the first time)** so iOS/Android system Bluetooth prompts are accepted; after that, the script can drive the UI.

---

## Part 2 — Automation folder setup (every clone)

From the **repository root**:

```bash
cd automation
npm install
```

This installs `agent-device` into `automation/node_modules`. The orchestrator runs it via `npx --prefix "$(pwd)" agent-device`.

### 2.1 Local device IDs (`.env`, not committed)

To avoid exporting **`IOS_DEVICE`**, **`IOS_UDID`**, **`ANDROID_PERIPHERAL_PACKAGE`**, etc. every time:

```bash
cd automation
cp .env.example .env
# Edit .env with your iPhone name, Android package id, optional ANDROID_SERIAL
```

`scripts/run-lbs-battery-e2e.sh` and `scripts/adb-peripheral-bootstrap.sh` load **`automation/.env`** if it exists. **Variables you already exported in the shell are not overwritten** by `.env` (so one-off overrides still work).

The repo root `.gitignore` ignores **`.env`**; **`automation/.env.example`** is the template to commit.

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

**Release peripheral:** export `ANDROID_PERIPHERAL_PACKAGE=com.bleperipheraldemo.release` in the same shell before `npm run e2e:lbs-battery` (the script patches Android replays and adb to use this package).

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
| `IOS_UDID` | Target a specific iPhone by UDID from `npx agent-device devices --json` (`id` on a row with `kind: device`). Most reliable; use if automation still boots a Simulator. |
| `IOS_DEVICE` | Physical device name (e.g. `iPhone-RG`). When `IOS_UDID` is unset, the script resolves this name against **`kind: device`** only and passes **`--udid`**, so iOS targets the phone instead of a Simulator. If resolution fails (name typo, phone unplugged), set `IOS_UDID` explicitly. **Required** unless `ALLOW_IOS_SIMULATOR_UNTARGETED=1`. |
| `ALLOW_IOS_SIMULATOR_UNTARGETED` | Set to `1` only if you intentionally run without `IOS_DEVICE` / `IOS_UDID` (e.g. you installed the central app on the booted simulator). |
| **`automation/.env`** | Same keys as above; loaded automatically if the variable is **unset** in the shell. Copy from **`automation/.env.example`**. |
| `PERIPH_SESSION` | Change the Android named session (default `ble-demo-peripheral`) if it collides with another run. |
| `CENT_SESSION` | Base name for the iOS session (default `ble-demo-central`). When `IOS_UDID` is set, the script appends a short hash so each phone gets a **fresh session name** and a stale daemon binding to a Simulator cannot persist. |
| `SKIP_ADB_BOOTSTRAP=1` | Skip step 0 if you already launched the peripheral and granted permissions. |
| `ANDROID_PERIPHERAL_PACKAGE` | Default `com.bleperipheraldemo` (debug). Use `com.bleperipheraldemo.release` for the **release** APK from this repo. |

**Example:**

```bash
cd automation
export ANDROID_PERIPHERAL_PACKAGE=com.bleperipheraldemo.release   # release peripheral only
export ANDROID_SERIAL=RFCX41ABCDE
export IOS_DEVICE="iPhone-RG"   # or: export IOS_UDID=00008140-...
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
| **Android `scrollintoview 'Several Words'` breaks** | The replay lexer splits on spaces; a quoted phrase like `'Nordic LED …'` becomes multiple args. Android replays here use **`scroll down`** plus **`click`** with `id=` / `label=` instead. |
| **`replay cannot override session lock policy with --device`** | Fixed in `run-lbs-battery-e2e.sh` via **`--session-lock strip`** on iOS when `IOS_DEVICE` / `IOS_UDID` is set (named session + device target). Update your script if you run `agent-device replay` manually the same way. |
| **iOS replay still targets Simulator (ignores `--udid`)** | **agent-device** keeps **named sessions** in the daemon. If `ble-demo-central` already exists from an earlier run, **`open` reuses that session’s device** and does not re-apply CLI `--udid`. The e2e script runs **`close`** on the central session first (step **0a**). Manually: `npx agent-device --session ble-demo-central --platform ios --session-lock strip --udid <UDID> close` (or omit `--udid` for close), then replay; or use a fresh **`CENT_SESSION`** name. |

---

## Stable selectors (reference)

Used by the `.ad` files under `replays/`:

- **Peripheral:** `peripheral-start`, `peripheral-char-2a19-slider-plus-step`; profile row `label="Peripheral profile Nordic LED Button Service"` (and on-screen title **Nordic LED Button Service** for scrolling); LBS switch `label="Peripheral LBS button switch"`.
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
