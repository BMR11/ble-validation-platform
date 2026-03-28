# Automation (placeholder)

This folder is reserved for **end-to-end automation** of the BLE emulator demo: driving both the peripheral and central apps, asserting GATT traffic, and validating UI state without manual tapping.

## Planned direction: Agent Device (Callstack)

[Agent Device](https://github.com/callstack/agent-device) (and similar tools) can orchestrate multiple app instances on emulators or physical devices. A future setup could:

1. Launch **peripheral-app** on an Android device/emulator, select a JSON profile, and start advertising.
2. Launch **central-app** on a second device (or iOS simulator where BLE allows), run scan/connect flows, and subscribe to notifications.
3. Assert **logs** and **on-screen metrics** (heart rate value, Nordic LED state) match expectations.
4. Rotate **profiles** (`profiles/heart-rate.json` vs `profiles/nordic-lbs.json`) and repeat.

## TODOs

- [ ] Add a minimal script entry point (e.g. Node + Appium / Maestro / Detox — TBD) that documents required env vars and device pairing.
- [ ] Define stable **accessibility labels** or test IDs on primary buttons in both apps for reliable UI automation.
- [ ] Capture **baseline screen recordings** or log excerpts for CI comparison.
- [ ] Optional: headless validation using two Android emulators with Bluetooth virtualization (platform-dependent).

No heavy automation is implemented in this repository yet; the demo is designed to be run manually as described in the root `README.md` and `docs/demo-flows.md`.
