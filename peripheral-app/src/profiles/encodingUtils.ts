/**
 * Encoding Utilities
 *
 * Pure functions for converting profile value definitions to base64 strings
 * compatible with rn-ble-peripheral-module APIs.
 *
 * All functions are stateless and side-effect free.
 */

import type { CharacteristicValueDef, SimulationEncoding } from './types';

// ─── Primitive Encoders ──────────────────────────────────────────────────────

/** Encode a plain string to base64. */
export function encodeStringValue(str: string): string {
  return btoa(str);
}

/** Encode a single byte (0-255) to base64. */
export function encodeUint8Value(value: number): string {
  return btoa(String.fromCharCode(value & 0xff));
}

/** Encode a byte array to base64. */
export function encodeUint8ArrayValue(bytes: readonly number[]): string {
  return btoa(String.fromCharCode(...bytes.map((b) => b & 0xff)));
}

/** Encode a hex string (e.g. "0048") to base64. */
export function encodeHexValue(hex: string): string {
  const cleaned = hex.replace(/\s/g, '');
  if (cleaned.length % 2 !== 0) {
    throw new Error(`Hex string must have even length, got "${hex}"`);
  }
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes.push(parseInt(cleaned.substring(i, i + 2), 16));
  }
  return encodeUint8ArrayValue(bytes);
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

/**
 * Encode an initial value from a CharacteristicValueDef to a base64 string.
 * Returns empty string if valueDef is undefined.
 */
export function encodeInitialValue(
  valueDef: CharacteristicValueDef | undefined
): string {
  if (!valueDef) {
    return '';
  }

  const { type, initial } = valueDef;

  switch (type) {
    case 'string':
      if (typeof initial !== 'string') {
        throw new Error(
          `Value type "string" requires string initial, got ${typeof initial}`
        );
      }
      return encodeStringValue(initial);

    case 'uint8':
      if (typeof initial !== 'number') {
        throw new Error(
          `Value type "uint8" requires number initial, got ${typeof initial}`
        );
      }
      return encodeUint8Value(initial);

    case 'uint8Array':
      if (!Array.isArray(initial)) {
        throw new Error(
          `Value type "uint8Array" requires number[] initial, got ${typeof initial}`
        );
      }
      return encodeUint8ArrayValue(initial);

    case 'hex':
      if (typeof initial !== 'string') {
        throw new Error(
          `Value type "hex" requires string initial, got ${typeof initial}`
        );
      }
      return encodeHexValue(initial);

    case 'base64':
      if (typeof initial !== 'string') {
        throw new Error(
          `Value type "base64" requires string initial, got ${typeof initial}`
        );
      }
      return initial;

    default:
      throw new Error(
        `Unknown value type "${type as string}"`
      );
  }
}

// ─── Simulation Encoding ─────────────────────────────────────────────────────

/**
 * Encode a simulation tick value using SimulationEncoding config.
 * Assembles: [...prefix, value, ...suffix] -> base64
 */
export function encodeSimulationValue(
  value: number,
  encoding: SimulationEncoding
): string {
  const bytes: number[] = [];

  if (encoding.prefix) {
    bytes.push(...encoding.prefix);
  }

  bytes.push(value & 0xff);

  if (encoding.suffix) {
    bytes.push(...encoding.suffix);
  }

  if (encoding.type === 'uint8' && !encoding.prefix && !encoding.suffix) {
    return encodeUint8Value(value);
  }

  return encodeUint8ArrayValue(bytes);
}
