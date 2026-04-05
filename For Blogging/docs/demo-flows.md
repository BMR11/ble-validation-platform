# Demo flows

## Prerequisites

- Two BLE-capable devices (or one phone + one tablet), **or** one central device and one Android peripheral.
- **Peripheral**: `peripheral-app` targets **Android** (`rn-ble-peripheral-module` peripheral APIs).
- **Central**: `central-app` on **iOS or Android** with Bluetooth enabled.
- Repo paths: install JS deps in **each** app folder (`peripheral-app`, `central-app`).

## Flow A — Heart rate profile

1. On the **peripheral** device, run `peripheral-app`, grant Bluetooth permissions.
2. Select **💓 Heart Rate Monitor**, tap **Start peripheral**. Confirm logs show advertising and GATT registration.
3. Optionally tap **Start Monitoring** (manual transition) if the central has not subscribed yet; once the central subscribes to **Heart Rate Measurement (0x2A37)**, the profile moves to **active** and simulated HR + battery drain run.
4. On the **central** device, run `central-app`, choose **💓 Heart Rate Monitor** target, tap **Scan (8s)**.
5. Tap the row matching advertised name **`RN_BLE_HR_Demo`** (or filtered device). Scan stops and you cannot change target or scan again until you **disconnect**.
6. Expand **Info** on the device card to read **Device Information Service** strings from the peripheral (when present).
7. Observe **HR** and **Battery** lines updating; logs show notify payloads.

## Flow B — Nordic LBS profile

1. Peripheral: select **⚡ Nordic LED Button Service**, **Start peripheral**.
2. Central: target **Nordic LBS**, scan, connect to **`My_LBS`** (or matching device). While connected, **target** and **Scan** are disabled; expand **Info** for DIS fields if needed.
3. Peripheral UI: use **Button** toggle — central logs should show button notify values.
4. Central: tap **LED ON** then **LED OFF** (order shown in the UI) — peripheral **LED** readonly field reflects `ledState` from writes (when state machine is **active**). In **idle**, writes are log-only per profile.

## Flow C — Error states (optional)

Both profiles include **Simulate Error** manual transitions. Use them to validate rejected reads/writes and altered notifications as defined in JSON `stateOverrides`.

## Troubleshooting

- **No scan results**: Ensure the peripheral is advertising; Android scan filters by primary service UUID — profiles must advertise that UUID (the engine derives UUIDs from `services` + optional DIS).
- **Connect succeeds but no data**: On heart rate, the engine often enables HR simulation only in **active** state after subscribe; subscribe from the central or trigger **Start Monitoring** on the peripheral.
- **iOS central**: Grant Bluetooth permission; first launch may need Settings → Bluetooth on.
