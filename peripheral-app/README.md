This is a new [**React Native**](https://reactnative.dev) project, bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

# Getting Started

## Remote profiles (`.env`)

For **Profile source → Remote**, copy **`.env.example`** to **`.env`** and set **`REMOTE_PROFILE_LAN_HOST`** (or **`REMOTE_PROFILE_TUNNEL_BASE`**) for your machine. Never commit **`.env`**. Details: [`docs/remote-profiles.md`](../docs/remote-profiles.md).

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Building Release APK

Use Gradle from the example app (same as any React Native project). Set `versionCode` and `versionName` in `example/android/app/build.gradle` if you need to change them.

```sh
cd example/android && ./gradlew assembleRelease --no-daemon
```

This example renames the release APK to `blep-example-release-{versionName}-{versionCode}.apk` under `example/android/app/build/outputs/apk/release/`. Install with `adb install -r <path-to-apk>` when you want to deploy to a device.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

**Android `debug.keystore`:** The example app does not commit a debug keystore. On first debug build, Gradle will create `example/android/app/debug.keystore` locally (or use your machine’s default debug key).

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.

# Learning and Notes:

- When we run this on iOS simulator, it will throw "API MISUSE: <CBPeripheralManager: 0x6000039240d0> can only accept this command while in the powered on state" When we try to call any API from CBPeripheralManager because we have enabled Bluetooth for only macOS SandBox and this is not awailable on iOS Simulators. So we need to run it on a real iOS device

# Quick install

1. `yarn install`
2. `yarn example:android` for Android
3. `yarn example:ios` for iOS

# ADB broadcast intents (optional)

The native module can forward Android broadcast intents to JavaScript when you register actions with `registerBroadcastReceiver`—useful for **ADB/automation** that drives the same code paths as your BLE peripheral (see the guide for the full pattern). The stock example app (`App.tsx`) logs received broadcasts and focuses on standard GATT demos; it does not ship product-specific handlers.

To try a generic broadcast from the repo root (scripts live in `example/scripts/`):

```sh
yarn send-broadcast
```

This uses action `com.bleperipheraldemo.CUSTOM_COMMAND`. Your own app should register the same action string (or any custom action) in JS and handle extras as needed.

See [Android broadcast intents](../docs/guides/android-broadcast-intents.md) for API details.
