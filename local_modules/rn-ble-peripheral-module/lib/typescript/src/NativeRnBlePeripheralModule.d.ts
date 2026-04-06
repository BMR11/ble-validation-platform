import type { TurboModule } from 'react-native';
import type { EventEmitter } from 'react-native/Libraries/Types/CodegenTypes';
/**
 * High-level adapter state (aligned with CBManagerState on iOS).
 */
export declare enum ManagerState {
    Unknown = 0,
    Resetting = 1,
    Unsupported = 2,
    Unauthorized = 3,
    PoweredOff = 4,
    PoweredOn = 5
}
/**
 * CBManagerAuthorization - Authorization status for Bluetooth
 */
export declare enum ManagerAuthorization {
    NotDetermined = 0,
    Restricted = 1,
    Denied = 2,
    AllowedAlways = 3
}
/**
 * CBCharacteristicProperties - Properties of a characteristic
 * Can be combined using bitwise OR
 */
export declare enum CharacteristicProperties {
    Broadcast = 1,
    Read = 2,
    WriteWithoutResponse = 4,
    Write = 8,
    Notify = 16,
    Indicate = 32,
    AuthenticatedSignedWrites = 64,
    ExtendedProperties = 128,
    NotifyEncryptionRequired = 256,
    IndicateEncryptionRequired = 512
}
/**
 * CBAttributePermissions - Permissions for characteristic access
 * Can be combined using bitwise OR
 */
export declare enum CharacteristicPermissions {
    Readable = 1,
    Writeable = 2,
    ReadEncryptionRequired = 4,
    WriteEncryptionRequired = 8
}
/**
 * CBATTError - ATT protocol error codes for responding to requests
 */
export declare enum ATTError {
    Success = 0,
    InvalidHandle = 1,
    ReadNotPermitted = 2,
    WriteNotPermitted = 3,
    InvalidPDU = 4,
    InsufficientAuthentication = 5,
    RequestNotSupported = 6,
    InvalidOffset = 7,
    InsufficientAuthorization = 8,
    PrepareQueueFull = 9,
    AttributeNotFound = 10,
    AttributeNotLong = 11,
    InsufficientEncryptionKeySize = 12,
    InvalidAttributeValueLength = 13,
    UnlikelyError = 14,
    InsufficientEncryption = 15,
    UnsupportedGroupType = 16,
    InsufficientResources = 17
}
/**
 * CBPeripheralManagerConnectionLatency - Connection latency options
 */
export declare enum ConnectionLatency {
    Low = 0,
    Medium = 1,
    High = 2
}
/**
 * Event fired when peripheral manager state changes
 * Corresponds to: peripheralManagerDidUpdateState(_:)
 */
export type EventDidUpdateState = {
    state: number;
    stateDescription: string;
};
/**
 * Event fired when advertising starts or fails
 * Corresponds to: peripheralManagerDidStartAdvertising(_:error:)
 */
export type EventDidStartAdvertising = {
    success: boolean;
    error?: string;
};
/**
 * Event fired when a service is added
 * Corresponds to: peripheralManager(_:didAdd:error:)
 */
export type EventDidAddService = {
    serviceUUID: string;
    success: boolean;
    error?: string;
};
/**
 * Event fired when a central subscribes to a characteristic
 * Corresponds to: peripheralManager(_:central:didSubscribeTo:)
 */
export type EventDidSubscribeToCharacteristic = {
    centralUUID: string;
    characteristicUUID: string;
    serviceUUID: string;
};
/**
 * Event fired when a central unsubscribes from a characteristic
 * Corresponds to: peripheralManager(_:central:didUnsubscribeFrom:)
 */
export type EventDidUnsubscribeFromCharacteristic = {
    centralUUID: string;
    characteristicUUID: string;
    serviceUUID: string;
};
/**
 * Event fired when a read request is received
 * Corresponds to: peripheralManager(_:didReceiveRead:)
 */
export type EventDidReceiveReadRequest = {
    requestId: number;
    centralUUID: string;
    characteristicUUID: string;
    serviceUUID: string;
    offset: number;
};
/**
 * Event fired when write request(s) are received
 * Corresponds to: peripheralManager(_:didReceiveWrite:)
 */
export type EventDidReceiveWriteRequests = {
    requestId: number;
    requests: Array<{
        centralUUID: string;
        characteristicUUID: string;
        serviceUUID: string;
        offset: number;
        value: string;
    }>;
};
/**
 * Event fired when peripheral manager is ready to update subscribers
 * Corresponds to: peripheralManagerIsReady(toUpdateSubscribers:)
 * This is called after updateValue returns false due to transmit queue being full
 */
export type EventReadyToUpdateSubscribers = {
    ready: boolean;
};
/**
 * Event fired for state restoration (background mode)
 * Corresponds to: peripheralManager(_:willRestoreState:)
 */
export type EventWillRestoreState = {
    services: Array<{
        uuid: string;
        isPrimary: boolean;
        characteristics: Array<{
            uuid: string;
            properties: number;
            permissions: number;
        }>;
    }>;
    advertisementData?: {
        localName?: string;
        serviceUUIDs?: string[];
    };
};
/**
 * Event fired when L2CAP channel is published
 * Corresponds to: peripheralManager(_:didPublishL2CAPChannel:error:)
 */
export type EventDidPublishL2CAPChannel = {
    psm: number;
    success: boolean;
    error?: string;
};
/**
 * Event fired when L2CAP channel is unpublished
 * Corresponds to: peripheralManager(_:didUnpublishL2CAPChannel:error:)
 */
export type EventDidUnpublishL2CAPChannel = {
    psm: number;
    success: boolean;
    error?: string;
};
/**
 * Event fired when L2CAP channel is opened
 * Corresponds to: peripheralManager(_:didOpen:error:)
 */
export type EventDidOpenL2CAPChannel = {
    psm: number;
    success: boolean;
    error?: string;
};
/**
 * Event fired when an Android broadcast intent is received
 * Only available on Android
 *
 * Note: The native code also sends an `extras` field containing Intent extras as a dynamic object.
 * Since React Native codegen doesn't support dynamic object types, `extras` is not included
 * in this type definition but will be present at runtime. Access it via: `(event as any).extras`
 * or cast the event: `const extras = (event as any).extras as Record<string, any>`
 */
export type EventDidReceiveBroadcastIntent = {
    action: string;
    data?: string;
    type?: string;
};
export interface Spec extends TurboModule {
    /**
     * Get the current state of the peripheral manager
     * @returns Promise resolving to ManagerState value
     */
    getState(): Promise<number>;
    /**
     * Get the authorization status for Bluetooth
     * @returns Promise resolving to ManagerAuthorization value
     */
    getAuthorization(): Promise<number>;
    /**
     * Check if the peripheral is currently advertising
     * @returns Promise resolving to boolean
     */
    isAdvertising(): Promise<boolean>;
    /**
     * Set the local name for advertising
     * @param name - The local name to advertise
     */
    setName(name: string): void;
    /**
     * Start advertising the peripheral
     * @param options - Optional JSON string with advertising options:
     *   - localName: string - Local name to advertise
     *   - serviceUUIDs: string[] - Array of service UUIDs to advertise
     */
    startAdvertising(options: string): Promise<void>;
    /**
     * Stop advertising the peripheral
     */
    stopAdvertising(): void;
    /**
     * Add a service to the peripheral
     * @param uuid - The UUID of the service
     * @param primary - Whether this is a primary service
     */
    addService(uuid: string, primary: boolean): void;
    /**
     * Remove a service from the peripheral
     * @param uuid - The UUID of the service to remove
     */
    removeService(uuid: string): void;
    /**
     * Remove all services from the peripheral
     */
    removeAllServices(): void;
    /**
     * Add a characteristic to a service
     * @param serviceUUID - The UUID of the service
     * @param uuid - The UUID of the characteristic
     * @param properties - Characteristic properties (CBCharacteristicProperties bitmask)
     * @param permissions - Characteristic permissions (CBAttributePermissions bitmask)
     * @param value - Initial value as Base64 encoded string (optional, pass empty string for no value)
     */
    addCharacteristicToService(serviceUUID: string, uuid: string, properties: number, permissions: number, value: string): void;
    /**
     * Update the value of a characteristic and notify subscribed centrals
     * @param serviceUUID - The UUID of the service
     * @param characteristicUUID - The UUID of the characteristic
     * @param value - The new value as Base64 encoded string
     * @param centralUUIDs - Optional JSON array of central UUIDs to notify (empty for all)
     * @returns Promise resolving to boolean indicating if the update was queued
     */
    updateValue(serviceUUID: string, characteristicUUID: string, value: string, centralUUIDs: string): Promise<boolean>;
    /**
     * Respond to a read or write request
     * @param requestId - The request ID from the read/write event
     * @param result - The ATTError result code
     * @param value - The value to send back (for read requests), Base64 encoded
     */
    respondToRequest(requestId: number, result: number, value: string): void;
    /**
     * Set the desired connection latency for a central
     * @param latency - The ConnectionLatency value
     * @param centralUUID - The UUID of the central
     */
    setDesiredConnectionLatency(latency: number, centralUUID: string): void;
    /**
     * Publish an L2CAP channel
     * @param withEncryption - Whether the channel requires encryption
     */
    publishL2CAPChannel(withEncryption: boolean): void;
    /**
     * Unpublish an L2CAP channel
     * @param psm - The PSM of the channel to unpublish
     */
    unpublishL2CAPChannel(psm: number): void;
    /**
     * Register a broadcast receiver to listen for Android broadcast intents
     * @param actions - Array of intent action strings to listen for (e.g., ["android.intent.action.BATTERY_CHANGED"])
     * @example
     * registerBroadcastReceiver(["android.intent.action.BATTERY_CHANGED", "android.intent.action.ACTION_POWER_CONNECTED"]);
     */
    registerBroadcastReceiver(actions: string[]): void;
    /**
     * Unregister the broadcast receiver
     * @example
     * unregisterBroadcastReceiver();
     */
    unregisterBroadcastReceiver(): void;
    /**
     * Simple multiply function for testing module connection
     */
    multiply(a: number, b: number): number;
    /**
     * Legacy start method - calls startAdvertising with empty options
     */
    start(): Promise<void>;
    /**
     * Legacy stop method - calls stopAdvertising
     */
    stop(): void;
    /**
     * Legacy sendNotificationToDevices - calls updateValue
     */
    sendNotificationToDevices(serviceUUID: string, characteristicUUID: string, data: string): void;
    /** Fires when peripheral manager state changes */
    readonly onDidUpdateState: EventEmitter<EventDidUpdateState>;
    /** Fires when advertising starts or fails */
    readonly onDidStartAdvertising: EventEmitter<EventDidStartAdvertising>;
    /** Fires when a service is added */
    readonly onDidAddService: EventEmitter<EventDidAddService>;
    /** Fires when a central subscribes to a characteristic */
    readonly onDidSubscribeToCharacteristic: EventEmitter<EventDidSubscribeToCharacteristic>;
    /** Fires when a central unsubscribes from a characteristic */
    readonly onDidUnsubscribeFromCharacteristic: EventEmitter<EventDidUnsubscribeFromCharacteristic>;
    /** Fires when a read request is received */
    readonly onDidReceiveReadRequest: EventEmitter<EventDidReceiveReadRequest>;
    /** Fires when write request(s) are received */
    readonly onDidReceiveWriteRequests: EventEmitter<EventDidReceiveWriteRequests>;
    /** Fires when ready to update subscribers (after queue was full) */
    readonly onReadyToUpdateSubscribers: EventEmitter<EventReadyToUpdateSubscribers>;
    /** Fires for state restoration (background mode) */
    readonly onWillRestoreState: EventEmitter<EventWillRestoreState>;
    /** Fires when L2CAP channel is published */
    readonly onDidPublishL2CAPChannel: EventEmitter<EventDidPublishL2CAPChannel>;
    /** Fires when L2CAP channel is unpublished */
    readonly onDidUnpublishL2CAPChannel: EventEmitter<EventDidUnpublishL2CAPChannel>;
    /** Fires when L2CAP channel is opened */
    readonly onDidOpenL2CAPChannel: EventEmitter<EventDidOpenL2CAPChannel>;
    /** Fires when an Android broadcast intent is received (Android only) */
    readonly onDidReceiveBroadcastIntent: EventEmitter<EventDidReceiveBroadcastIntent>;
}
declare const _default: Spec;
export default _default;
//# sourceMappingURL=NativeRnBlePeripheralModule.d.ts.map