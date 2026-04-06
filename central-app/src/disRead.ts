import { Platform } from 'react-native';
import BleManager from 'react-native-ble-manager';
import type { PeripheralInfo } from 'react-native-ble-manager';
import { normUuid, toFullUuid16, uuidShort16 } from './uuid';

/** Standard DIS (0x180A) characteristics — same set as `ProfileDeviceInfo` in peripheral profiles. */
const DIS_FIELDS: readonly { readonly label: string; readonly short: string }[] = [
  { label: 'Manufacturer', short: '2A29' },
  { label: 'Model number', short: '2A24' },
  { label: 'Serial number', short: '2A25' },
  { label: 'Hardware revision', short: '2A27' },
  { label: 'Firmware revision', short: '2A26' },
  { label: 'Software revision', short: '2A28' },
];

function findDiscoveredPair(
  info: PeripheralInfo,
  shortChar: string
): { service: string; characteristic: string } | null {
  const wantChar = normUuid(shortChar).padStart(4, '0').slice(-4);
  for (const c of info.characteristics ?? []) {
    const svc = c.service;
    const ch = c.characteristic;
    if (!svc || !ch) {
      continue;
    }
    if (uuidShort16(svc) !== '180a') {
      continue;
    }
    if (uuidShort16(ch) !== wantChar) {
      continue;
    }
    return { service: svc, characteristic: ch };
  }
  return null;
}

function pushUnique(
  out: { service: string; characteristic: string }[],
  seen: Set<string>,
  service: string,
  characteristic: string
): void {
  const key = `${normUuid(service)}|${normUuid(characteristic)}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  out.push({ service, characteristic });
}

/**
 * Order matters: try discovery-derived UUIDs first (native stack format), then common alternates.
 */
function readAttemptsForCharacteristic(
  discovered: { service: string; characteristic: string } | null,
  short: string
): { service: string; characteristic: string }[] {
  const seen = new Set<string>();
  const out: { service: string; characteristic: string }[] = [];
  if (discovered) {
    pushUnique(out, seen, discovered.service, discovered.characteristic);
  }
  const fullS = toFullUuid16('180A');
  const fullC = toFullUuid16(short);
  if (Platform.OS === 'ios') {
    pushUnique(out, seen, '180A', short);
    pushUnique(out, seen, fullS, short);
    pushUnique(out, seen, '180A', fullC);
    pushUnique(out, seen, fullS, fullC);
  } else {
    pushUnique(out, seen, fullS, fullC);
  }
  return out;
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
  const discovered = findDiscoveredPair(info, short);
  const attempts = readAttemptsForCharacteristic(discovered, short);
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
