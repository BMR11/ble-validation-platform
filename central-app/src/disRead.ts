import BleManager from 'react-native-ble-manager';
import type { PeripheralInfo } from 'react-native-ble-manager';
import { gattAccessAttempts } from './discoveredGatt';

/** Standard DIS (0x180A) characteristics — same set as `ProfileDeviceInfo` in peripheral profiles. */
const DIS_FIELDS: readonly { readonly label: string; readonly short: string }[] = [
  { label: 'Manufacturer', short: '2A29' },
  { label: 'Model number', short: '2A24' },
  { label: 'Serial number', short: '2A25' },
  { label: 'Hardware revision', short: '2A27' },
  { label: 'Firmware revision', short: '2A26' },
  { label: 'Software revision', short: '2A28' },
];

/**
 * Stay on the discovered service. On an Apple peripheral that service is the
 * vendor alias; falling back to SIG 180A would read the host's Device Information.
 */
function readAttemptsForCharacteristic(
  info: PeripheralInfo,
  short: string
): { service: string; characteristic: string }[] {
  return gattAccessAttempts(info, '180A', short);
}

function bytesToUtf8(bytes: number[]): string {
  if (!bytes.length) {
    return '';
  }
  const trimmed: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    if (b === 0) {
      break;
    }
    trimmed.push(b);
  }
  try {
    return String.fromCharCode(...trimmed);
  } catch {
    return trimmed.map((b) => String.fromCharCode(b)).join('');
  }
}

function toByteArray(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return raw as number[];
  }
  if (raw && typeof raw === 'object' && 'length' in raw) {
    return Array.from(raw as ArrayLike<number>);
  }
  return [];
}

async function readDisCharacteristic(
  peripheralId: string,
  info: PeripheralInfo,
  short: string
): Promise<number[] | null> {
  const attempts = readAttemptsForCharacteristic(info, short);
  for (const { service, characteristic } of attempts) {
    try {
      const raw = await BleManager.read(peripheralId, service, characteristic);
      return toByteArray(raw);
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Discovers GATT (retrieveServices), then reads Device Information characteristics.
 * Uses UUIDs from discovery when present so reads match the stack’s representation.
 */
export async function readDeviceInformationService(
  peripheralId: string
): Promise<{ label: string; value: string }[]> {
  const info = await BleManager.retrieveServices(peripheralId);
  const rows: { label: string; value: string }[] = [];
  for (const { label, short } of DIS_FIELDS) {
    const bytes = await readDisCharacteristic(peripheralId, info, short);
    if (bytes == null) {
      continue;
    }
    const value = bytesToUtf8(bytes).trim();
    if (value.length > 0) {
      rows.push({ label, value });
    }
  }
  return rows;
}
