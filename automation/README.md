# Automation (agent-device + adb)

End-to-end validation for the BLE demo using [agent-device](https://github.com/callstackincubator/agent-device) (Callstack) on **iOS central-app** and **Android peripheral-app**, plus **adb** for launching the peripheral and granting Bluetooth permissions.

## What this automation checks

After **central connects** to the peripheral, the default (`e2e:lbs-battery`) flow runs **in order**:

1. **Battery**: Peripheral increments battery once (**50% → 60%**); **central-app** must show `Battery: 60%`.
2. **Button (LBS)**: Peripheral toggles the **button** characteristic; **central-app** must show `Button: Pressed` (baseline before toggle is `Button: Released`).
3. **LED**: **central-app** taps **LED ON** then **LED OFF**; **peripheral-app** must show on-screen `LED: ON` then `LED: OFF` (see stable selectors below).

Optional: extend battery to **80%** with the legacy replays `05-battery-to-80.ad` + `06-assert-battery-80.ad` (not part of the default orchestrator).

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

**Reset stuck daemon state (when sessions feel wrong or devices won’t bind):**

```bash
rm -f ~/.agent-device/daemon.json ~/.agent-device/daemon.lock
```

Then run your next `agent-device` command again (the daemon will recreate its files). Use this if you see odd session reuse, stale locks, or after upgrading agent-device.

### 1.3 Build and install both apps

Do this once per device (or when native code changes).

| App | Path | Typical install |
|-----|------|-----------------|
| **Peripheral** | `peripheral-app/` | `cd peripheral-app && npx react-native run-android` (USB device or emulator) |
| **Central** | `central-app/` | `cd central-app && npx react-native run-ios --device "Your iPhone"` (or `--simulator "iPhone 16"` only if BLE works in your setup) |

**Important:** This flow needs a **real Bluetooth link** between peripheral and central in almost all cases. Use a **physical Android phone** as peripheral and a **physical iPhone** as central unless you know your emulator/simulator supports BLE for both roles.

- Android **application id**: **debug** `com.bleperipheraldemo` · **release** (this repo) `com.bleperipheraldemo.release` — set `ANDROID_PERIPHERAL_PACKAGE` when using release (see Part 1.4). Launcher title defaults to **`PERIPHERAL_APP_NAME`** in **`automation/.env.example`**; Android replays use `open "<name>"` and the script substitutes the package id when needed.
- iOS **Springboard name** for `agent-device open`: set **`CENTRAL_APP_NAME`** in **`automation/.env`** / **`.env.example`** (default matches `CFBundleDisplayName`). Bundle ID in replay temp scripts: `org.reactjs.native.example.BleCentralDemo` (same for Debug and typical Release).

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

Orchestrator scripts source **`load-automation-env.sh`**, which loads **`automation/.env`** (optional, gitignored) first, then **`automation/.env.example`** for any key still unset. **Exports already present in the shell are not overwritten** (CI / one-off overrides still win).

Edit **`automation/.env`** for machine-specific values (e.g. `IOS_DEVICE`), or change **`automation/.env.example`** if you want new repo-wide defaults. The repo root `.gitignore` ignores **`.env`**; **`.env.example`** is committed.

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

   Note the **exact device name** (e.g. `iPhone-RG`) for `IOS_DEVICE` (Part 5). Use `IOS_UDID` only if you must target by id.

### 3.3 Physical placement

- Keep the two devices **within normal BLE range** (meters, not rooms away).
- Accept any **first-launch Bluetooth / permission** dialogs on both apps before relying on full automation; you can re-run after that.

---

## Part 4 — Full automated run (recommended)

The default flow is **`e2e:lbs-battery`** (tap replays on **both** platforms). For an alternate run that drives the **peripheral** with **`adb` broadcasts** instead of Android taps, see **Part 4b**.

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
| **2** | iOS `02-connect-and-baseline.ad` | Connect to **My_LBS**, then assert **Button: Released** and **Battery: 50%** (sync with peripheral defaults). |
| **3–4** | Android `peripheral-battery-plus-10-once.ad` → iOS `central-assert-battery-60.ad` | Peripheral **+10** battery (50→60); central must show **Battery: 60%**. |
| **5–6** | Android `03-toggle-lbs-button.ad` → iOS `04-assert-button-pressed.ad` | Peripheral toggles **Button**; central shows **Button: Pressed**. |
| **7–8** | iOS `central-led-on.ad` → Android `peripheral-assert-led-on.ad` | Central **LED ON**; peripheral UI shows **`LED: ON`**. |
| **9–10** | iOS `central-led-off.ad` → Android `peripheral-assert-led-off.ad` | Central **LED OFF**; peripheral shows **`LED: OFF`**. |
| **11** | Teardown | Close sessions + force-stop peripheral (see script). |

Optional legacy battery sweep (**80%**): `replays/android/05-battery-to-80.ad` + `replays/ios/06-assert-battery-80.ad` (not run by the default orchestrator).

If any replay fails, the script exits with a non-zero status at the failing command; fix the issue (Part 7) and re-run from the start.

---

## Part 4b — V2 cross-e2e (Android `adb` broadcasts + iOS replay)

This is an **alternate** full run to **`npm run e2e:lbs-battery`**. It drives the **peripheral** with **`adb shell am broadcast`** (custom `AUTOMATION_*` commands handled in **`peripheral-app`** `ProfileApp.tsx`) instead of agent-device **tap** replays on Android. The **central** still uses **agent-device** replay (`.ad` UI automation) for Nordic target → Scan → Connect → LED ON/OFF.

**Prerequisites** are the same as Parts **1–3** (physical Android + iPhone, both apps installed, `cd automation && npm install`, **`automation/.env`** with **`IOS_DEVICE`** and app names — see Part 2).

### 4b.1 Command

From the **repository root** (not only `automation/`):

```bash
bash automation/scripts/v2/run-nordic-cross-e2e-broadcast-v2.sh
```

**Debug / diagnostics:** pass **`-d`** or **`--debug`** to print agent-device and adb details (for example **`SESSION_NOT_FOUND`** when closing a session that was never opened — harmless, hidden by default). Example:

```bash
bash automation/scripts/v2/run-nordic-cross-e2e-broadcast-v2.sh -d
```

Step lines stay plain (what happens on the **peripheral** vs **iPhone**). Full **agent-device** / **adb** output, and benign **`close`** messages like **SESSION_NOT_FOUND**, appear only when **`V2_VERBOSE=1`**, **`V2_DEBUG=1`**, or **`-d`** / **`--debug`** (the CLI flag turns **`V2_DEBUG`** and **`V2_VERBOSE`** on after **`.env`** is loaded).

### 4b.2 What happens (order)

| Phase | Android peripheral | iOS central |
|--------|-------------------|-------------|
| **Cleanup** | `adb` **force-stop** package | **`close <bundle>`** (stop **Central App**) + **close** sessions (best-effort). All close calls run **in parallel**. |
| **Bootstrap** | **`scripts/adb-peripheral-bootstrap.sh`**: `wait-for-device`, **pm grant** BT perms, **monkey** launch app | — |
| **Post-launch wait** | Sleep **`V2_POST_BOOTSTRAP_MS`** (default **1500** ms) so RN can **`registerBroadcastReceiver`** before intents arrive | — |
| **Broadcasts 1–4** | **`am broadcast`**: `AUTOMATION_SELECT_LOCAL` → `AUTOMATION_SELECT_PROFILE` (`profileId=nordic-lbs`) → `AUTOMATION_START_PERIPHERAL` (`profileId=nordic-lbs`) → `AUTOMATION_SHOW_LOGS`. Gap between commands: **`V2_BROADCAST_GAP_MS`** (default **200** ms). | — |
| **Central UI** | — | **`agent-device open`** `CENTRAL_APP_NAME`, then **five** replay segments **`v2-ios-00` … `v2-ios-04`**: Show logs → Nordic + Scan + wait → Connect + wait → LED ON → LED OFF (one 🔵 line per segment). Monolithic **`v2-nordic-connect-led.ad`** kept for manual full replay. |
| **Broadcasts 5–6** | `AUTOMATION_BUTTON_ON` → `AUTOMATION_BUTTON_OFF` | — |
| **Broadcasts 7–11** | `AUTOMATION_BATTERY_PLUS_10` ×3 → `AUTOMATION_BATTERY_MINUS_10` ×2 (1 s gap between each). Default battery 50 → 60 → 70 → 80 → 70 → 60. | — |
| **Teardown** | **force-stop** + session close | **`close <bundle>`** (stop central app) + session **close** |

iOS is **not** opened before Android: the first `open` for central runs when the iOS replay phase starts (after the peripheral is advertising via broadcasts).

**Step format:** `Step N => 🟣 Peripheral : <message>` or `Step N => 🔵 Central : <message>`. Cleanup step uses `🧹`. Elapsed time printed after all steps.

### 4b.3 One-off broadcast (debug)

From the repo root:

```bash
bash automation/scripts/v2/adb-send-automation-broadcast.sh AUTOMATION_SELECT_LOCAL
bash automation/scripts/v2/adb-send-automation-broadcast.sh AUTOMATION_START_PERIPHERAL -- --es profileId nordic-lbs
bash automation/scripts/v2/adb-send-automation-broadcast.sh AUTOMATION_SHOW_LOGS
bash automation/scripts/v2/adb-send-automation-broadcast.sh AUTOMATION_BATTERY_PLUS_10
bash automation/scripts/v2/adb-send-automation-broadcast.sh AUTOMATION_BATTERY_MINUS_10
```

Available commands: `AUTOMATION_SELECT_LOCAL`, `AUTOMATION_SELECT_PROFILE` (needs `--es profileId <id>`), `AUTOMATION_START_PERIPHERAL` (needs `--es profileId <id>`), `AUTOMATION_BUTTON_ON`, `AUTOMATION_BUTTON_OFF`, `AUTOMATION_SHOW_LOGS`, `AUTOMATION_BATTERY_PLUS_10`, `AUTOMATION_BATTERY_MINUS_10`.

The peripheral app should be **foreground**; check in-app logs / **logcat** for **`[automation]`** lines when a command is handled.

### 4b.4 Env vars (V2)

Set in **`automation/.env`** (see **`.env.example`**). Same base vars as Part 5 (**`IOS_DEVICE`**, **`ANDROID_PERIPHERAL_PACKAGE`**, **`CENTRAL_APP_NAME`**, etc.) plus:

| Variable | Default | Purpose |
|----------|---------|---------|
| `V2_POST_BOOTSTRAP_MS` | `1500` | Wait after **monkey** launch before the first **`AUTOMATION_*`** broadcast so JS mounts and the broadcast receiver is registered. **Increase** if `AUTOMATION_START_PERIPHERAL` appears to do nothing. |
| `V2_BROADCAST_GAP_MS` | `200` | Pause between consecutive broadcast shell commands. |
| `SKIP_ADB_BOOTSTRAP` | `0` | Set to `1` to skip launch + grants if the peripheral is already running with permissions OK. |
| `V2_VERBOSE` | `0` | Set to `1` to print **agent-device** / **adb** child output. **`V2_DEBUG=1`** or **`-d`** / **`--debug`** also forces this on. |
| `V2_DEBUG` | `0` | Set to `1` to show benign **`close`** diagnostics (e.g. **SESSION_NOT_FOUND** when no session was open). Same effect as **`-d`**. CLI **`-d`** always turns this **on** after loading **`.env`**. |

**Console output:** One readable line per step (**🟣** = Android peripheral, **🔵** = iPhone central). Benign **`close`** errors (e.g. **SESSION_NOT_FOUND**) are hidden unless **`V2_DEBUG=1`** or **`-d`**. Use **`-d`** when you need full tool diagnostics.

### 4b.5 Troubleshooting (V2)

- **Broadcasts “do nothing”** despite `Broadcast completed: result=0`: raise **`V2_POST_BOOTSTRAP_MS`** (race before **`registerBroadcastReceiver`**).
- **iOS connect step fails**: segment **`v2-ios-02-connect-wait.ad`** uses **`Central connect My_LBS`**. If the scan row shows a **UUID** instead of **My_LBS**, edit that file (and **`v2-nordic-connect-led.ad`** if you use the monolithic replay) to match **`Central connect <name>`** from **`CentralApp.tsx`** (Part 7).
- **Wrong Android device**: set **`ANDROID_SERIAL`** (Part 5).

---

## Part 5 — Environment variables (optional)

Set these in the shell **before** `npm run e2e:lbs-battery`:

| Variable | When to use |
|----------|-------------|
| `ANDROID_SERIAL` | Multiple Android devices connected; set to the serial from `adb devices`. |
| `IOS_DEVICE` | **Preferred** for a physical central iPhone: exact name from `npx agent-device devices --json` (row with `kind: device`), e.g. `iPhone-RG`. The script passes **`--device`** to agent-device (same idea as `open "<CENTRAL_APP_NAME>" --platform ios --device "iPhone-RG"`). **Required** unless `IOS_UDID` or `ALLOW_IOS_SIMULATOR_UNTARGETED=1`. |
| `IOS_UDID` | Optional alternative: USB/Core Device id from the same JSON. Used only when **`IOS_DEVICE` is unset**; the script passes **`--udid`**. On some Macs `--udid` has routed to a Simulator incorrectly; prefer **`IOS_DEVICE`** first. |
| `ALLOW_IOS_SIMULATOR_UNTARGETED` | Set to `1` only if you intentionally run without `IOS_DEVICE` / `IOS_UDID` (e.g. you installed the central app on the booted simulator). |
| **`automation/.env`** | Optional overrides; loaded first. Then **`automation/.env.example`** fills defaults. Shell exports still win. |
| `CENTRAL_APP_NAME` | iOS home-screen label passed to **`agent-device open`**. Set in **`automation/.env`** (copy from **`.env.example`**). Legacy: **`IOS_CENTRAL_DISPLAY_NAME`** is used **only if** `CENTRAL_APP_NAME` is unset after loading both files (so remove or comment out `CENTRAL_APP_NAME` if you rely on the legacy key). |
| `PERIPHERAL_APP_NAME` | Android launcher title used in replay `open "…"` (must match the quoted string in **`replays/android/*.ad`**). Same pattern as `CENTRAL_APP_NAME`; legacy **`ANDROID_PERIPHERAL_OPEN_DISPLAY`**. **`run-lbs-battery-e2e.sh`** substitutes **`ANDROID_PERIPHERAL_PACKAGE`** for release builds. |
| `PERIPH_SESSION` | Change the Android named session (default `ble-demo-peripheral`) if it collides with another run. |
| `CENT_SESSION` | Base name for the iOS session (default `ble-demo-central`). When `IOS_DEVICE` or `IOS_UDID` is set, the script appends a short hash so each phone gets a **fresh session name** and a stale daemon binding to a Simulator cannot persist. |
| `SKIP_ADB_BOOTSTRAP=1` | Skip step 0 if you already launched the peripheral and granted permissions. |
| `ANDROID_PERIPHERAL_PACKAGE` | Default `com.bleperipheraldemo` (debug). Use `com.bleperipheraldemo.release` for the **release** APK from this repo. |
| `IOS_CENTRAL_BUNDLE_REPLAY` | Default `org.reactjs.native.example.BleCentralDemo`. The script removes this `open …` line from temp replays because the real open is done via **`CENTRAL_APP_NAME`**. |
| `V2_POST_BOOTSTRAP_MS` | **V2 script only** (Part 4b). Default `2000`. Wait after adb launch before **`AUTOMATION_*`** broadcasts. |
| `V2_BROADCAST_GAP_MS` | **V2 script only** (Part 4b). Default `450`. Delay between broadcast commands. |
| `V2_VERBOSE` | **V2 script only** (Part 4b). Default `0`. Set to `1` to show full **agent-device** / **adb** output. |

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

**Learning (iOS):** In our testing, **iOS automation only became reliable after the Automation Agent daemon app was installed on the physical iPhone by building and running it from Xcode** (per agent-device / Callstack setup for the on-device test runner). Relying only on whatever the CLI installs automatically was not enough in that environment—use the Xcode install path for the agent when replays fail to drive the device.

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
| **`open` inside `replay` uses Simulator even with `--device`** | Known limitation in recent **agent-device** builds: nested replay steps do not inherit device selection. **`run-lbs-battery-e2e.sh`** works around this by running a top-level `open "<CENTRAL_APP_NAME>" --platform ios --device "…"` (same as your manual CLI), then replaying a temp script with the embedded `open <bundleId>` line removed. Override **`CENTRAL_APP_NAME`** / **`IOS_CENTRAL_BUNDLE_REPLAY`** in **`automation/.env`** if your app label or bundle id differs. |
| **iOS replays never control the phone / agent seems dead** | Clear daemon state: `rm -f ~/.agent-device/daemon.json ~/.agent-device/daemon.lock`, then retry. Confirm the **Automation Agent** app is on the device (see learning note above); install it via **Xcode** if the automatic install did not work. |
| **Stale session / wrong device after many runs** | Same as above: `rm -f ~/.agent-device/daemon.json ~/.agent-device/daemon.lock`, or use a fresh **`CENT_SESSION`** / **`IOS_AGENT_SESSION`** name. |

---

## Stable selectors (reference)

Used by the `.ad` files under `replays/`:

- **Peripheral:** `peripheral-start`, `peripheral-profile-nordic-lbs`, `peripheral-char-2a19-slider-plus-step`; LBS switch `label="Peripheral LBS button switch"`; **LED:** on-screen `LED: ON` / `LED: OFF` (`testID=peripheral-lbs-led-state-text`); battery `label="Peripheral battery plus ten"`.
- **Central:** `central-target-nordic-lbs`, `central-scan`, `label="Central device My_LBS"` (default **`02-connect-and-baseline.ad`**), or **`label="Central connect My_LBS"`** (V2 segments **`v2-ios-02-…`** / monolithic **`v2-nordic-connect-led.ad`** — must match **`CentralApp`** `Central connect ${deviceName}`), `central-metric-button`, `central-metric-battery`.

---

## Replay file index

| Step | File |
|------|------|
| Android: start Nordic LBS | `replays/android/01-start-nordic-lbs.ad` |
| iOS: connect + baseline | `replays/ios/02-connect-and-baseline.ad` |
| Android: battery +10 once | `replays/android/peripheral-battery-plus-10-once.ad` |
| iOS: assert battery 60% | `replays/ios/central-assert-battery-60.ad` |
| Android: toggle LBS button | `replays/android/03-toggle-lbs-button.ad` |
| iOS: assert button pressed | `replays/ios/04-assert-button-pressed.ad` |
| iOS: LED on | `replays/ios/central-led-on.ad` |
| Android: assert LED ON | `replays/android/peripheral-assert-led-on.ad` |
| iOS: LED off | `replays/ios/central-led-off.ad` |
| Android: assert LED OFF | `replays/android/peripheral-assert-led-off.ad` |
| (optional) Android: battery → 80% | `replays/android/05-battery-to-80.ad` |
| (optional) iOS: assert 80% | `replays/ios/06-assert-battery-80.ad` |
| **V2:** iOS (split, used by v2 script) | `replays/ios/v2-ios-00-show-logs.ad` … `v2-ios-04-led-off.ad` |
| **V2:** iOS (single file, manual) | `replays/ios/v2-nordic-connect-led.ad` |
