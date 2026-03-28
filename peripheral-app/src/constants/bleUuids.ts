/**
 * BLE UUIDs and demo strings for the example app (not the core library).
 */

/** Default value echoed on read requests for demo characteristics */
export const DEFAULT_CHARACTERISTIC_READ_VALUE = 'Hello BLE';

// Standard Heart Rate Service
export const HEART_RATE_SERVICE_UUID = '180D';
export const HEART_RATE_MEASUREMENT_UUID = '2A37';

// Custom service (read/write demo)
export const CUSTOM_SERVICE_UUID = '12345678-1234-1234-1234-123456789ABC';
export const CUSTOM_READ_CHAR_UUID = '12345678-1234-1234-1234-123456789001';
export const CUSTOM_WRITE_CHAR_UUID = '12345678-1234-1234-1234-123456789002';
export const CUSTOM_NOTIFY_CHAR_UUID = '12345678-1234-1234-1234-123456789003';

// LBS (LED Button Service) — see SwiftCoreBluetoothDemo
export const LBS_SERVICE_UUID = '00001523-1212-EFDE-1523-785FEABCD123';
export const LBS_BUTTON_CHAR_UUID = '00001524-1212-EFDE-1523-785FEABCD123';
export const LBS_LED_CHAR_UUID = '00001525-1212-EFDE-1523-785FEABCD123';

// Battery
export const BATTERY_SERVICE_UUID = '180F';
export const BATTERY_LEVEL_CHAR_UUID = '2A19';

/** Matches example/scripts/send-broadcast.js and native forwarding filter */
export const EXAMPLE_BROADCAST_ACTION =
  'com.bleperipheralmanager.example.CUSTOM_COMMAND';

// Device Information Service (0x180A)
export const DEVICE_INFO_SERVICE_UUID = '180A';
export const DIS_MANUFACTURER_NAME_UUID = '2A29';
export const DIS_MODEL_NUMBER_UUID = '2A24';
export const DIS_SERIAL_NUMBER_UUID = '2A25';
export const DIS_HARDWARE_REVISION_UUID = '2A27';
export const DIS_FIRMWARE_REVISION_UUID = '2A26';
export const DIS_SOFTWARE_REVISION_UUID = '2A28';

export const DEVICE_INFO = {
  manufacturerName: 'Demo Manufacturer',
  modelNumber: 'RN-BLE-Peripheral-001',
  serialNumber: 'DEMO-2024-001234',
  hardwareRevision: '1.0.0',
  firmwareRevision: '2.1.0',
  softwareRevision: '1.0.0',
} as const;
