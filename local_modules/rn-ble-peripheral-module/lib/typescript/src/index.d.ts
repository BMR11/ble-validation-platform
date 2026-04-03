/**
 * Public JS API for `rn-ble-peripheral-module`.
 * Only symbols required by the peripheral emulator are exported; the native
 * implementation still exposes the full TurboModule surface.
 */
export { ManagerState, ManagerAuthorization, CharacteristicProperties, CharacteristicPermissions, ATTError, ConnectionLatency, type EventDidUpdateState, type EventDidStartAdvertising, type EventDidAddService, type EventDidSubscribeToCharacteristic, type EventDidUnsubscribeFromCharacteristic, type EventDidReceiveReadRequest, type EventDidReceiveWriteRequests, } from './NativeRnBlePeripheralModule';
export interface AdvertisingOptions {
    localName?: string;
    serviceUUIDs?: string[];
}
export declare function setName(name: string): void;
export declare function startAdvertising(options?: AdvertisingOptions): Promise<void>;
export declare function stopAdvertising(): void;
export declare function addService(uuid: string, primary: boolean): void;
export declare function removeAllServices(): void;
export declare function addCharacteristicToServiceBase64(serviceUUID: string, uuid: string, properties: number, permissions: number, base64Value?: string): void;
export declare function updateValueBase64(serviceUUID: string, characteristicUUID: string, base64Value: string, centralUUIDs?: string[]): Promise<boolean>;
export declare function respondToRequestBase64(requestId: number, result: number, base64Value?: string): void;
export declare const onDidUpdateState: import("react-native/Libraries/Types/CodegenTypes").EventEmitter<import("./NativeRnBlePeripheralModule").EventDidUpdateState>;
export declare const onDidStartAdvertising: import("react-native/Libraries/Types/CodegenTypes").EventEmitter<import("./NativeRnBlePeripheralModule").EventDidStartAdvertising>;
export declare const onDidAddService: import("react-native/Libraries/Types/CodegenTypes").EventEmitter<import("./NativeRnBlePeripheralModule").EventDidAddService>;
export declare const onDidSubscribeToCharacteristic: import("react-native/Libraries/Types/CodegenTypes").EventEmitter<import("./NativeRnBlePeripheralModule").EventDidSubscribeToCharacteristic>;
export declare const onDidUnsubscribeFromCharacteristic: import("react-native/Libraries/Types/CodegenTypes").EventEmitter<import("./NativeRnBlePeripheralModule").EventDidUnsubscribeFromCharacteristic>;
export declare const onDidReceiveReadRequest: import("react-native/Libraries/Types/CodegenTypes").EventEmitter<import("./NativeRnBlePeripheralModule").EventDidReceiveReadRequest>;
export declare const onDidReceiveWriteRequests: import("react-native/Libraries/Types/CodegenTypes").EventEmitter<import("./NativeRnBlePeripheralModule").EventDidReceiveWriteRequests>;
export declare function base64StringToDecimal(base64: string): number;
export declare function getStateDescription(state: number): string;
//# sourceMappingURL=index.d.ts.map