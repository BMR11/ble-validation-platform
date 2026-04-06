"use strict";

/**
 * Public JS API for `rn-ble-peripheral-module`.
 * Only symbols required by the peripheral emulator are exported; the native
 * implementation still exposes the full TurboModule surface.
 */

import { Buffer } from 'buffer';
import Native from "./NativeRnBlePeripheralModule.js";
export { ManagerState, ManagerAuthorization, CharacteristicProperties, CharacteristicPermissions, ATTError, ConnectionLatency } from "./NativeRnBlePeripheralModule.js";
export function setName(name) {
  Native.setName(name);
}
export function startAdvertising(options) {
  const optionsJson = options ? JSON.stringify(options) : '{}';
  return Native.startAdvertising(optionsJson);
}
export function stopAdvertising() {
  Native.stopAdvertising();
}
export function addService(uuid, primary) {
  Native.addService(uuid, primary);
}
export function removeAllServices() {
  Native.removeAllServices();
}
export function addCharacteristicToServiceBase64(serviceUUID, uuid, properties, permissions, base64Value = '') {
  Native.addCharacteristicToService(serviceUUID, uuid, properties, permissions, base64Value);
}
export async function updateValueBase64(serviceUUID, characteristicUUID, base64Value, centralUUIDs) {
  const centralsJson = centralUUIDs ? JSON.stringify(centralUUIDs) : '[]';
  return Native.updateValue(serviceUUID, characteristicUUID, base64Value, centralsJson);
}
export function respondToRequestBase64(requestId, result, base64Value = '') {
  Native.respondToRequest(requestId, result, base64Value);
}
export const onDidUpdateState = Native.onDidUpdateState;
export const onDidStartAdvertising = Native.onDidStartAdvertising;
export const onDidAddService = Native.onDidAddService;
export const onDidSubscribeToCharacteristic = Native.onDidSubscribeToCharacteristic;
export const onDidUnsubscribeFromCharacteristic = Native.onDidUnsubscribeFromCharacteristic;
export const onDidReceiveReadRequest = Native.onDidReceiveReadRequest;
export const onDidReceiveWriteRequests = Native.onDidReceiveWriteRequests;

/** Android: register intent actions to receive via {@link onDidReceiveBroadcastIntent} (ADB/automation). */
export const registerBroadcastReceiver = Native.registerBroadcastReceiver;
export const unregisterBroadcastReceiver = Native.unregisterBroadcastReceiver;
export const onDidReceiveBroadcastIntent = Native.onDidReceiveBroadcastIntent;
export function base64StringToDecimal(base64) {
  const buf = Buffer.from(base64, 'base64');
  let value = 0;
  for (const byte of buf) {
    value = value << 8 | byte;
  }
  return value;
}
export function getStateDescription(state) {
  const descriptions = {
    0: 'Unknown',
    1: 'Resetting',
    2: 'Unsupported',
    3: 'Unauthorized',
    4: 'Powered Off',
    5: 'Powered On'
  };
  return descriptions[state] ?? 'Unknown';
}
//# sourceMappingURL=index.js.map