/**
 * Public JS API for `rn-ble-peripheral-module`.
 * Only symbols required by the peripheral emulator are exported; the native
 * implementation still exposes the full TurboModule surface.
 */

import { Buffer } from 'buffer';
import Native from './NativeRnBlePeripheralModule';

export {
  ManagerState,
  ManagerAuthorization,
  CharacteristicProperties,
  CharacteristicPermissions,
  ATTError,
  ConnectionLatency,
  type EventDidUpdateState,
  type EventDidStartAdvertising,
  type EventDidAddService,
  type EventDidSubscribeToCharacteristic,
  type EventDidUnsubscribeFromCharacteristic,
  type EventDidReceiveReadRequest,
  type EventDidReceiveWriteRequests,
} from './NativeRnBlePeripheralModule';

export interface AdvertisingOptions {
  localName?: string;
  serviceUUIDs?: string[];
}

export function setName(name: string): void {
  Native.setName(name);
}

export function startAdvertising(options?: AdvertisingOptions): Promise<void> {
  const optionsJson = options ? JSON.stringify(options) : '{}';
  return Native.startAdvertising(optionsJson);
}

export function stopAdvertising(): void {
  Native.stopAdvertising();
}

export function addService(uuid: string, primary: boolean): void {
  Native.addService(uuid, primary);
}

export function removeAllServices(): void {
  Native.removeAllServices();
}

export function addCharacteristicToServiceBase64(
  serviceUUID: string,
  uuid: string,
  properties: number,
  permissions: number,
  base64Value: string = ''
): void {
  Native.addCharacteristicToService(
    serviceUUID,
    uuid,
    properties,
    permissions,
    base64Value
  );
}

export async function updateValueBase64(
  serviceUUID: string,
  characteristicUUID: string,
  base64Value: string,
  centralUUIDs?: string[]
): Promise<boolean> {
  const centralsJson = centralUUIDs ? JSON.stringify(centralUUIDs) : '[]';
  return Native.updateValue(
    serviceUUID,
    characteristicUUID,
    base64Value,
    centralsJson
  );
}

export function respondToRequestBase64(
  requestId: number,
  result: number,
  base64Value: string = ''
): void {
  Native.respondToRequest(requestId, result, base64Value);
}

export const onDidUpdateState = Native.onDidUpdateState;
export const onDidStartAdvertising = Native.onDidStartAdvertising;
export const onDidAddService = Native.onDidAddService;
export const onDidSubscribeToCharacteristic =
  Native.onDidSubscribeToCharacteristic;
export const onDidUnsubscribeFromCharacteristic =
  Native.onDidUnsubscribeFromCharacteristic;
export const onDidReceiveReadRequest = Native.onDidReceiveReadRequest;
export const onDidReceiveWriteRequests = Native.onDidReceiveWriteRequests;

export function base64StringToDecimal(base64: string): number {
  const buf: Buffer = Buffer.from(base64, 'base64');
  let value = 0;
  for (const byte of buf) {
    value = (value << 8) | byte;
  }
  return value;
}

export function getStateDescription(state: number): string {
  const descriptions: Record<number, string> = {
    0: 'Unknown',
    1: 'Resetting',
    2: 'Unsupported',
    3: 'Unauthorized',
    4: 'Powered Off',
    5: 'Powered On',
  };
  return descriptions[state] ?? 'Unknown';
}
