/**
 * Profile System Type Definitions
 *
 * All TypeScript interfaces for the BLE Device Profile JSON schema.
 * These types describe the shape of profile JSON files and are used
 * by the ProfileEngine, SimulationRunner, and StateMachineRunner.
 *
 * This module also exports property/permission mapping utilities
 * that convert human-readable strings to native bitmask values.
 */

/* eslint-disable no-bitwise */
import {
  CharacteristicProperties,
  CharacteristicPermissions,
  ATTError,
} from 'react-native-ble-peripheral-manager';

// ─── Top-Level Profile ───────────────────────────────────────────────────────

/** A complete BLE device profile that can be loaded and executed by the engine. */
export interface BleProfile {
  readonly id: string;
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
  readonly advertising: ProfileAdvertising;
  readonly deviceInfo?: ProfileDeviceInfo;
  readonly services: readonly ProfileService[];
  readonly stateMachine?: ProfileStateMachine;
}

// ─── Advertising ─────────────────────────────────────────────────────────────

export interface ProfileAdvertising {
  readonly localName: string;
  readonly deviceName?: string;
  readonly serviceUUIDs?: readonly string[];
}

// ─── Device Information Service Shorthand ────────────────────────────────────

export interface ProfileDeviceInfo {
  readonly manufacturerName?: string;
  readonly modelNumber?: string;
  readonly serialNumber?: string;
  readonly hardwareRevision?: string;
  readonly firmwareRevision?: string;
  readonly softwareRevision?: string;
}

/** Maps ProfileDeviceInfo field names to their DIS characteristic UUIDs. */
export const DIS_FIELD_MAP: Record<keyof ProfileDeviceInfo, string> = {
  manufacturerName: '2A29',
  modelNumber: '2A24',
  serialNumber: '2A25',
  hardwareRevision: '2A27',
  firmwareRevision: '2A26',
  softwareRevision: '2A28',
};

export const DIS_SERVICE_UUID = '180A';

// ─── GATT Service ────────────────────────────────────────────────────────────

export interface ProfileService {
  readonly uuid: string;
  readonly name?: string;
  readonly primary?: boolean;
  readonly characteristics: readonly ProfileCharacteristic[];
}

// ─── GATT Characteristic ─────────────────────────────────────────────────────

export interface ProfileCharacteristic {
  readonly uuid: string;
  readonly name?: string;
  readonly properties: readonly CharPropertyName[];
  readonly permissions: readonly CharPermissionName[];
  readonly value?: CharacteristicValueDef;
  readonly simulation?: SimulationConfig;
  readonly ui?: UiHint;
  readonly onWrite?: WriteAction;
  readonly stateOverrides?: Readonly<
    Record<string, CharacteristicStateOverride>
  >;
}

// ─── Value Definition ────────────────────────────────────────────────────────

export type ValueType = 'string' | 'uint8' | 'uint8Array' | 'hex' | 'base64';

export interface CharacteristicValueDef {
  readonly type: ValueType;
  readonly initial: string | number | number[];
}

// ─── Simulation ──────────────────────────────────────────────────────────────

export type SimulationType =
  | 'randomRange'
  | 'randomWalk'
  | 'increment'
  | 'decrement'
  | 'sine';

export interface SimulationConfig {
  readonly enabled: boolean;
  readonly type: SimulationType;
  readonly intervalMs: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly encoding: SimulationEncoding;
}

export interface SimulationEncoding {
  readonly type: 'uint8' | 'uint8Array';
  readonly prefix?: readonly number[];
  readonly suffix?: readonly number[];
}

// ─── UI Hints ────────────────────────────────────────────────────────────────

export type UiControlType = 'stepper' | 'slider' | 'toggle' | 'readonly';

export interface UiHint {
  readonly label: string;
  readonly unit?: string;
  readonly control: UiControlType;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

// ─── Write Action ────────────────────────────────────────────────────────────

export type WriteDecodeType = 'uint8' | 'string' | 'boolean';

export interface WriteAction {
  readonly action: 'log' | 'updateState';
  readonly stateKey?: string;
  readonly decode?: WriteDecodeType;
}

// ─── State Machine ───────────────────────────────────────────────────────────

export interface ProfileStateMachine {
  readonly initial: string;
  readonly states: Readonly<Record<string, StateDefinition>>;
}

export interface StateDefinition {
  readonly name: string;
  readonly description?: string;
  readonly transitions: readonly StateTransition[];
}

export interface StateTransition {
  readonly to: string;
  readonly trigger: TransitionTrigger;
  readonly label?: string;
}

export type TransitionTrigger =
  | { readonly type: 'manual' }
  | { readonly type: 'onSubscribe'; readonly characteristicUUID?: string }
  | { readonly type: 'onUnsubscribe'; readonly characteristicUUID?: string }
  | {
      readonly type: 'onWrite';
      readonly characteristicUUID: string;
      readonly value?: number;
    }
  | { readonly type: 'timer'; readonly delayMs: number };

// ─── State Overrides ─────────────────────────────────────────────────────────

export type ReadBehavior = 'normal' | 'reject' | 'static';
export type WriteBehavior = 'normal' | 'reject' | 'log';

export interface CharacteristicStateOverride {
  readonly simulation?: SimulationConfig;
  readonly value?: CharacteristicValueDef;
  readonly readBehavior?: ReadBehavior;
  readonly writeBehavior?: WriteBehavior;
  readonly rejectError?: string;
}

// ─── Property / Permission String Mappings ───────────────────────────────────

export type CharPropertyName =
  | 'read'
  | 'write'
  | 'writeWithoutResponse'
  | 'notify'
  | 'indicate';

export type CharPermissionName =
  | 'readable'
  | 'writeable'
  | 'readEncryptionRequired'
  | 'writeEncryptionRequired';

const PROPERTY_MAP: Record<CharPropertyName, number> = {
  read: CharacteristicProperties.Read,
  write: CharacteristicProperties.Write,
  writeWithoutResponse: CharacteristicProperties.WriteWithoutResponse,
  notify: CharacteristicProperties.Notify,
  indicate: CharacteristicProperties.Indicate,
};

const PERMISSION_MAP: Record<CharPermissionName, number> = {
  readable: CharacteristicPermissions.Readable,
  writeable: CharacteristicPermissions.Writeable,
  readEncryptionRequired: CharacteristicPermissions.ReadEncryptionRequired,
  writeEncryptionRequired: CharacteristicPermissions.WriteEncryptionRequired,
};

const ATT_ERROR_MAP: Record<string, number> = {
  Success: ATTError.Success,
  InvalidHandle: ATTError.InvalidHandle,
  ReadNotPermitted: ATTError.ReadNotPermitted,
  WriteNotPermitted: ATTError.WriteNotPermitted,
  InvalidPDU: ATTError.InvalidPDU,
  InsufficientAuthentication: ATTError.InsufficientAuthentication,
  RequestNotSupported: ATTError.RequestNotSupported,
  InvalidOffset: ATTError.InvalidOffset,
  UnlikelyError: ATTError.UnlikelyError,
  InsufficientEncryption: ATTError.InsufficientEncryption,
};

/** Combine an array of property name strings into a single bitmask. */
export function resolveProperties(names: readonly CharPropertyName[]): number {
  return names.reduce((mask, name) => {
    const value = PROPERTY_MAP[name];
    if (value === undefined) {
      throw new Error(
        `Unknown property "${name}". Valid: ${Object.keys(PROPERTY_MAP).join(', ')}`
      );
    }
    return mask | value;
  }, 0);
}

/** Combine an array of permission name strings into a single bitmask. */
export function resolvePermissions(
  names: readonly CharPermissionName[]
): number {
  return names.reduce((mask, name) => {
    const value = PERMISSION_MAP[name];
    if (value === undefined) {
      throw new Error(
        `Unknown permission "${name}". Valid: ${Object.keys(PERMISSION_MAP).join(', ')}`
      );
    }
    return mask | value;
  }, 0);
}

/** Resolve an ATT error name string to its numeric value. */
export function resolveATTError(name: string): number {
  const value = ATT_ERROR_MAP[name];
  if (value === undefined) {
    throw new Error(
      `Unknown ATT error "${name}". Valid: ${Object.keys(ATT_ERROR_MAP).join(', ')}`
    );
  }
  return value;
}

// ─── Runtime State Types (used by the engine internally) ─────────────────────

/** Runtime state for a single characteristic during profile execution. */
export interface CharacteristicRuntimeState {
  currentValue: number | number[] | string;
  encodedValue: string;
  readonly definition: ProfileCharacteristic;
  readonly serviceUUID: string;
  readBehavior: ReadBehavior;
  writeBehavior: WriteBehavior;
  rejectError?: string;
}

/** Callbacks the engine provides to the UI layer. */
export interface ProfileEngineCallbacks {
  onLog: (message: string, type?: string) => void;
  onValueChange: (
    serviceUUID: string,
    charUUID: string,
    value: number | number[] | string
  ) => void;
  onWriteStateChange: (stateKey: string, value: unknown) => void;
  onStateChange: (stateId: string, stateDef: StateDefinition) => void;
  onAdvertisingChange: (isAdvertising: boolean) => void;
}
