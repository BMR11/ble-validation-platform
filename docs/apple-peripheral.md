# iOS and macOS peripheral

The peripheral app runs on **Android** and on **iOS** (physical iPhone or iPad). macOS uses the same CoreBluetooth peripheral stack, so Battery and Device Information are provisioned the same way there. A separate React Native macOS app target is not in this repo; the native module is the macOS GATT host.

Bluetooth peripheral mode is not available in the iOS Simulator. Use a real Apple device, or Android.

## Why standard Battery and Device Information fail on Apple

iOS and macOS already publish these services for the computer or phone:

| Service | UUID | What the OS serves |
|---------|------|--------------------|
| Battery | `180F` | The host battery percentage |
| Device Information | `180A` | Manufacturer `Apple Inc.` and the Mac or iPhone model |

`CBPeripheralManager` has no API to replace those values. If the app adds `180F` or `180A`, centrals read the host device. Generic Access (`1800`) and Generic Attribute (`1801`) are reserved outright and are not used by these profiles.

Heart Rate (`180D`) and the Nordic LED Button service are not system services. They stay on their normal UUIDs.

## How this repo publishes them

On the Apple peripheral host only, the native module rewrites system-owned **service** UUIDs before they are added or advertised. Characteristic UUIDs stay on the Bluetooth SIG base (`2A19`, `2A29`, and the other Device Information characteristics). Profiles and the Android build keep `180F` and `180A`.

The alias keeps the assigned number in the first group and replaces the Bluetooth company id with this platform’s vendor node `B1E000000000`:

| Profile UUID | Published on iOS and macOS |
|--------------|----------------------------|
| `180F` | `0000180F-0000-1000-8000-B1E000000000` |
| `180A` | `0000180A-0000-1000-8000-B1E000000000` |

That 128-bit UUID is not the SIG base (`…-00805F9B34FB`), so CoreBluetooth does not treat it as the system service.

When at least one of those services is registered, the module also adds a primary **provisioning catalog**:

- Service `F1B0A001-B1E0-4000-8000-00805F9B34FB`
- Read characteristic `F1B0A002-B1E0-4000-8000-00805F9B34FB`
- UTF-8 JSON, for example `{"180A":"0000180A-0000-1000-8000-B1E000000000","180F":"0000180F-0000-1000-8000-B1E000000000"}`

nRF Connect can read that characteristic to see where Battery and Device Information were placed. The catalog is not put in the advertising packet.

The in-repo central does not need the catalog. After service discovery it uses the alias when it is present, and the SIG UUID when it is not (Android peripheral). It does not subscribe to the system Battery service, and it does not read the system Device Information service, when the alias is in the GATT database.

The formula lives in `shared/appleGattProvisioning.ts` and `local_modules/rn-ble-peripheral-module/ios/AppleGattProvisioning.swift`.

## Run the iOS peripheral

From `peripheral-app`, on a Mac with Xcode:

```bash
npm install
npm run pi
npm start
```

In another terminal, with the iPhone plugged in and trusted:

```bash
npm run ios -- --device
```

Grant Bluetooth when prompted. Select a profile and tap **Start peripheral**. The log names the alias UUID for Battery and Device Information.

Then run `central-app` on a second phone (iOS or Android), scan, and connect. Battery notifications and the Info panel should show the profile values (for example the demo manufacturer), not the iPhone’s own battery or “Apple Inc.”.

## macOS

A Mac’s `CBPeripheralManager` overrides `180F` and `180A` the same way. The Swift peripheral module is the code path for both platforms: the same alias and catalog are used if that module is built into a macOS host.

This repo’s UI target is the iOS app (`peripheral-app/ios`). Running that UI as a Mac app needs a Mac and a `react-native-macos` target generated on macOS; it is not produced here. Advertising from an iPhone next to a Mac central is the supported Apple peripheral setup in this tree.
