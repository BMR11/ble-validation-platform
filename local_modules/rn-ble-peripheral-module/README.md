# rn-ble-peripheral-module

Local TurboModule: BLE GATT peripheral (advertiser + GATT server) on iOS, macOS (same CoreBluetooth host), and Android. Built for the BLE device emulator app in this repo.

On iOS and macOS, Battery (`180F`) and Device Information (`180A`) are system services. `AppleGattProvisioning.swift` publishes them on the vendor UUIDs documented in `shared/appleGattProvisioning.ts` so profile values are not replaced by the host device. Android keeps the SIG UUIDs.
