# BLE Central Demo (`central-app`)

React Native app using **`react-native-ble-manager`** to scan, connect, and talk to the peripheral emulator (`peripheral-app`).

## Prerequisites

- Xcode + CocoaPods (`pod` on your `PATH` is enough; `bundle install` is optional).
- Set a UTF-8 locale when running CocoaPods (avoids `ASCII-8BIT` / unicode errors):

  ```bash
  export LANG=en_US.UTF-8
  export LC_ALL=en_US.UTF-8
  ```

## iOS setup (required on first clone / after native dep changes)

1. Install JS deps from **this folder**:

   ```bash
   yarn install   # or npm install
   ```

2. Install pods (creates `ios/Pods/` and `BleCentralDemo.xcworkspace`):

   ```bash
   yarn pod-install
   ```

   Equivalent manual command:

   ```bash
   cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install && cd ..
   ```

3. **Physical iPhone**: Xcode must know your **Team** for signing.
   - Open **`ios/BleCentralDemo.xcworkspace`** (not the `.xcodeproj`).
   - Select target **BleCentralDemo** → **Signing & Capabilities** → choose your **Team**  
     (`CODE_SIGN_STYLE` is already **Automatic** in the project).

4. Run the app:
   - **Simulator** (avoids device signing if you only have a simulator booted):

     ```bash
     yarn ios --simulator "iPhone 16"
     ```

     Adjust the simulator name to one you have (`xcrun simctl list devices available`).

   - **Device**: after step 3, `yarn ios` will target a connected device if one is selected/booted.

### If you see errors like “Unable to open … Pods-BleCentralDemo.debug.xcconfig”

`Pods/` was never generated. Run **`yarn pod-install`** again from `central-app`.

### If CocoaPods prints “Unicode Normalization not appropriate for ASCII-8BIT”

Export `LANG=en_US.UTF-8` and `LC_ALL=en_US.UTF-8` (see above), then re-run `pod install`.

## Android

```bash
yarn android
```

Ensure Bluetooth permissions are granted when prompted.

## Metro

```bash
yarn start
```

## Tests

```bash
yarn test
```

(May require a proper local environment; BLE native module is not exercised in Jest by default.)
