"use strict";

import { TurboModuleRegistry } from 'react-native';
// Enums and numeric constants mirror CoreBluetooth / Android GATT state codes
// so JS can share one set of symbols across platforms.

/**
 * High-level adapter state (aligned with CBManagerState on iOS).
 */
export let ManagerState = /*#__PURE__*/function (ManagerState) {
  ManagerState[ManagerState["Unknown"] = 0] = "Unknown";
  ManagerState[ManagerState["Resetting"] = 1] = "Resetting";
  ManagerState[ManagerState["Unsupported"] = 2] = "Unsupported";
  ManagerState[ManagerState["Unauthorized"] = 3] = "Unauthorized";
  ManagerState[ManagerState["PoweredOff"] = 4] = "PoweredOff";
  ManagerState[ManagerState["PoweredOn"] = 5] = "PoweredOn";
  return ManagerState;
}({});

/**
 * CBManagerAuthorization - Authorization status for Bluetooth
 */
export let ManagerAuthorization = /*#__PURE__*/function (ManagerAuthorization) {
  ManagerAuthorization[ManagerAuthorization["NotDetermined"] = 0] = "NotDetermined";
  ManagerAuthorization[ManagerAuthorization["Restricted"] = 1] = "Restricted";
  ManagerAuthorization[ManagerAuthorization["Denied"] = 2] = "Denied";
  ManagerAuthorization[ManagerAuthorization["AllowedAlways"] = 3] = "AllowedAlways";
  return ManagerAuthorization;
}({});

/**
 * CBCharacteristicProperties - Properties of a characteristic
 * Can be combined using bitwise OR
 */
export let CharacteristicProperties = /*#__PURE__*/function (CharacteristicProperties) {
  CharacteristicProperties[CharacteristicProperties["Broadcast"] = 1] = "Broadcast";
  CharacteristicProperties[CharacteristicProperties["Read"] = 2] = "Read";
  CharacteristicProperties[CharacteristicProperties["WriteWithoutResponse"] = 4] = "WriteWithoutResponse";
  CharacteristicProperties[CharacteristicProperties["Write"] = 8] = "Write";
  CharacteristicProperties[CharacteristicProperties["Notify"] = 16] = "Notify";
  CharacteristicProperties[CharacteristicProperties["Indicate"] = 32] = "Indicate";
  CharacteristicProperties[CharacteristicProperties["AuthenticatedSignedWrites"] = 64] = "AuthenticatedSignedWrites";
  CharacteristicProperties[CharacteristicProperties["ExtendedProperties"] = 128] = "ExtendedProperties";
  CharacteristicProperties[CharacteristicProperties["NotifyEncryptionRequired"] = 256] = "NotifyEncryptionRequired";
  CharacteristicProperties[CharacteristicProperties["IndicateEncryptionRequired"] = 512] = "IndicateEncryptionRequired";
  return CharacteristicProperties;
}({});

/**
 * CBAttributePermissions - Permissions for characteristic access
 * Can be combined using bitwise OR
 */
export let CharacteristicPermissions = /*#__PURE__*/function (CharacteristicPermissions) {
  CharacteristicPermissions[CharacteristicPermissions["Readable"] = 1] = "Readable";
  CharacteristicPermissions[CharacteristicPermissions["Writeable"] = 2] = "Writeable";
  CharacteristicPermissions[CharacteristicPermissions["ReadEncryptionRequired"] = 4] = "ReadEncryptionRequired";
  CharacteristicPermissions[CharacteristicPermissions["WriteEncryptionRequired"] = 8] = "WriteEncryptionRequired";
  return CharacteristicPermissions;
}({});

/**
 * CBATTError - ATT protocol error codes for responding to requests
 */
export let ATTError = /*#__PURE__*/function (ATTError) {
  ATTError[ATTError["Success"] = 0] = "Success";
  ATTError[ATTError["InvalidHandle"] = 1] = "InvalidHandle";
  ATTError[ATTError["ReadNotPermitted"] = 2] = "ReadNotPermitted";
  ATTError[ATTError["WriteNotPermitted"] = 3] = "WriteNotPermitted";
  ATTError[ATTError["InvalidPDU"] = 4] = "InvalidPDU";
  ATTError[ATTError["InsufficientAuthentication"] = 5] = "InsufficientAuthentication";
  ATTError[ATTError["RequestNotSupported"] = 6] = "RequestNotSupported";
  ATTError[ATTError["InvalidOffset"] = 7] = "InvalidOffset";
  ATTError[ATTError["InsufficientAuthorization"] = 8] = "InsufficientAuthorization";
  ATTError[ATTError["PrepareQueueFull"] = 9] = "PrepareQueueFull";
  ATTError[ATTError["AttributeNotFound"] = 10] = "AttributeNotFound";
  ATTError[ATTError["AttributeNotLong"] = 11] = "AttributeNotLong";
  ATTError[ATTError["InsufficientEncryptionKeySize"] = 12] = "InsufficientEncryptionKeySize";
  ATTError[ATTError["InvalidAttributeValueLength"] = 13] = "InvalidAttributeValueLength";
  ATTError[ATTError["UnlikelyError"] = 14] = "UnlikelyError";
  ATTError[ATTError["InsufficientEncryption"] = 15] = "InsufficientEncryption";
  ATTError[ATTError["UnsupportedGroupType"] = 16] = "UnsupportedGroupType";
  ATTError[ATTError["InsufficientResources"] = 17] = "InsufficientResources";
  return ATTError;
}({});

/**
 * CBPeripheralManagerConnectionLatency - Connection latency options
 */
export let ConnectionLatency = /*#__PURE__*/function (ConnectionLatency) {
  ConnectionLatency[ConnectionLatency["Low"] = 0] = "Low";
  ConnectionLatency[ConnectionLatency["Medium"] = 1] = "Medium";
  ConnectionLatency[ConnectionLatency["High"] = 2] = "High";
  return ConnectionLatency;
}({});

// ============================================================================
// EVENT TYPES - All delegate callbacks from CBPeripheralManagerDelegate
// ============================================================================

/**
 * Event fired when peripheral manager state changes
 * Corresponds to: peripheralManagerDidUpdateState(_:)
 */

/**
 * Event fired when advertising starts or fails
 * Corresponds to: peripheralManagerDidStartAdvertising(_:error:)
 */

/**
 * Event fired when a service is added
 * Corresponds to: peripheralManager(_:didAdd:error:)
 */

/**
 * Event fired when a central subscribes to a characteristic
 * Corresponds to: peripheralManager(_:central:didSubscribeTo:)
 */

/**
 * Event fired when a central unsubscribes from a characteristic
 * Corresponds to: peripheralManager(_:central:didUnsubscribeFrom:)
 */

/**
 * Event fired when a read request is received
 * Corresponds to: peripheralManager(_:didReceiveRead:)
 */

/**
 * Event fired when write request(s) are received
 * Corresponds to: peripheralManager(_:didReceiveWrite:)
 */

/**
 * Event fired when peripheral manager is ready to update subscribers
 * Corresponds to: peripheralManagerIsReady(toUpdateSubscribers:)
 * This is called after updateValue returns false due to transmit queue being full
 */

/**
 * Event fired for state restoration (background mode)
 * Corresponds to: peripheralManager(_:willRestoreState:)
 */

/**
 * Event fired when L2CAP channel is published
 * Corresponds to: peripheralManager(_:didPublishL2CAPChannel:error:)
 */

/**
 * Event fired when L2CAP channel is unpublished
 * Corresponds to: peripheralManager(_:didUnpublishL2CAPChannel:error:)
 */

/**
 * Event fired when L2CAP channel is opened
 * Corresponds to: peripheralManager(_:didOpen:error:)
 */

/**
 * Event fired when an Android broadcast intent is received
 * Only available on Android
 *
 * Note: The native code also sends an `extras` field containing Intent extras as a dynamic object.
 * Since React Native codegen doesn't support dynamic object types, `extras` is not included
 * in this type definition but will be present at runtime. Access it via: `(event as any).extras`
 * or cast the event: `const extras = (event as any).extras as Record<string, any>`
 */

// ============================================================================
// TURBO MODULE SPEC
// ============================================================================

export default TurboModuleRegistry.getEnforcing('RnBlePeripheralModule');
//# sourceMappingURL=NativeRnBlePeripheralModule.js.map