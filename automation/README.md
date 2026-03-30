# Automation (agent-device + adb)

End-to-end validation for the BLE demo using [agent-device](https://github.com/callstackincubator/agent-device) (Callstack) on **iOS central-app** and **Android peripheral-app**, plus **adb** for launching the peripheral and granting Bluetooth permissions.

## What is covered

- **Nordic LBS**: peripheral toggles the LBS **button** characteristic; central-app should show `Button: Pressed` after the toggle.
- **Battery**: peripheral **Battery** slider (+10 × 3 from the bundled profile default 50%); central-app should show `Battery: 80%`.

## Prerequisites

1. **Hardware / OS**: Real BLE path is required between devices. iOS Simulator usually does not expose usable BLE for this flow—prefer a physical iPhone. Android must run the peripheral (USB debugging on, or emulator only if your environment supports BLE peripheral).
2. **Install apps**: Debug or release builds of `peripheral-app` (Android) and `central-app` (iOS) on the targets.
3. **Node**: Node 18+.
4. **Install CLI deps** (from this folder):

```bash
cd automation && npm install
```

5. **agent-device** host setup: follow [agent-device docs](https://incubator.callstack.com/agent-device/docs/introduction) (permissions, Xcode/Android tooling, devices discoverable via `npx agent-device devices`).

## Stable selectors

Both apps expose `testID` / `accessibilityLabel` values used in the `.ad` replays under `replays/`. Examples:

- Peripheral: `peripheral-profile-nordic-lbs`, `peripheral-start`, `peripheral-char-2a19-slider-plus-step`, LBS switch `id=peripheral-char-000015241212efde1523785feabcd123-switch`.
- Central: `central-target-nordic-lbs`, `central-scan`, `label="Central device My_LBS"`, `central-metric-button`, `central-metric-battery`.

## adb-only bootstrap (Android peripheral)

Starts the app and attempts `pm grant` for Bluetooth-related permissions (API 31+):

```bash
./scripts/adb-peripheral-bootstrap.sh
```

Optional environment:

- `ANDROID_SERIAL`: if multiple devices are connected, set to the target serial (also supported by the orchestrator).

## Full cross-device flow

The orchestrator uses **named sessions** so Android and iOS commands do not stomp each other (`--session` / `PERIPH_SESSION`, `CENT_SESSION`).

```bash
cd automation
npm run e2e:lbs-battery
```

Environment:

| Variable | Purpose |
|----------|---------|
| `ANDROID_SERIAL` | adb / agent-device Android target |
| `IOS_UDID` | agent-device iOS device/simulator UDID |
| `PERIPH_SESSION` | default `ble-demo-peripheral` |
| `CENT_SESSION` | default `ble-demo-central` |
| `SKIP_ADB_BOOTSTRAP=1` | skip `adb-peripheral-bootstrap.sh` if you already launched the app |

## Replay files

| Step | File |
|------|------|
| Android start Nordic LBS | `replays/android/01-start-nordic-lbs.ad` |
| iOS connect + baseline | `replays/ios/02-connect-and-baseline.ad` |
| Android toggle button | `replays/android/03-toggle-lbs-button.ad` |
| iOS assert pressed | `replays/ios/04-assert-button-pressed.ad` |
| Android battery → 80% | `replays/android/05-battery-to-80.ad` |
| iOS assert 80% | `replays/ios/06-assert-battery-80.ad` |

Run a single replay (example):

```bash
npx agent-device --session ble-demo-peripheral --platform android replay replays/android/01-start-nordic-lbs.ad
```

## Troubleshooting

- **Scan empty**: ensure peripheral shows **advertising** (Nordic profile, `My_LBS` name hints). Increase waits in `02-connect-and-baseline.ad` if the link is slow.
- **Selectors fail after an OS upgrade**: re-record or run `agent-device replay -u <file.ad>` to refresh selectors ([replay maintenance](https://github.com/callstackincubator/agent-device)).
- **Permissions**: on first iOS launch, accept Bluetooth alerts manually once, or automate via agent-device `settings` / alerts flow as needed.
