/**
 * Pick Battery / Device Information handles from a connected peripheral.
 *
 * Apple hosts publish those services on the vendor alias from
 * `shared/appleGattProvisioning.ts` and may also expose the system 180F/180A
 * service. Prefer the alias so reads and notifications use the profile.
 * Android peripherals keep the SIG UUID; use that when no alias is present.
 */

import {
  isAppleAliasForShort,
  sameGattUuid,
  uuidMatchesAssignedShort,
} from '../../shared/appleGattProvisioning';
import { toFullUuid16 } from './uuid';

export interface DiscoveredGatt {
  readonly services?: ReadonlyArray<{ readonly uuid?: string }>;
  readonly characteristics?: ReadonlyArray<{
    readonly service?: string;
    readonly characteristic?: string;
  }>;
}

export interface GattPair {
  readonly service: string;
  readonly characteristic: string;
}

function pushUnique(out: string[], seen: Set<string>, uuid?: string): void {
  if (!uuid) {
    return;
  }
  const key = uuid.replace(/-/g, '').toLowerCase();
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  out.push(uuid);
}

export function listServiceUuids(info: DiscoveredGatt): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const service of info.services ?? []) {
    pushUnique(out, seen, service.uuid);
  }
  for (const characteristic of info.characteristics ?? []) {
    pushUnique(out, seen, characteristic.service);
  }
  return out;
}

function pairOnService(
  info: DiscoveredGatt,
  serviceUuid: string,
  characteristicShort: string
): GattPair {
  for (const characteristic of info.characteristics ?? []) {
    if (!characteristic.service || !characteristic.characteristic) {
      continue;
    }
    if (!sameGattUuid(characteristic.service, serviceUuid)) {
      continue;
    }
    if (
      !uuidMatchesAssignedShort(
        characteristic.characteristic,
        characteristicShort
      )
    ) {
      continue;
    }
    return {
      service: characteristic.service,
      characteristic: characteristic.characteristic,
    };
  }
  return { service: serviceUuid, characteristic: characteristicShort };
}

/**
 * Service to use for an assigned number. The Apple alias wins when the host
 * published one; otherwise the SIG service (Android and other peripherals).
 */
export function resolveDiscoveredPair(
  info: DiscoveredGatt,
  serviceShort: string,
  characteristicShort: string
): GattPair | null {
  const services = listServiceUuids(info);
  const alias = services.find((uuid) => isAppleAliasForShort(uuid, serviceShort));
  const sig = services.find((uuid) =>
    uuidMatchesAssignedShort(uuid, serviceShort)
  );
  const serviceUuid = alias ?? sig;
  if (!serviceUuid) {
    return null;
  }
  return pairOnService(info, serviceUuid, characteristicShort);
}

/** Discovered pair, then the same service with short and SIG-base characteristic UUIDs. */
export function gattAccessAttempts(
  info: DiscoveredGatt,
  serviceShort: string,
  characteristicShort: string
): GattPair[] {
  const pair = resolveDiscoveredPair(info, serviceShort, characteristicShort);
  if (!pair) {
    return [];
  }
  const candidates: GattPair[] = [
    pair,
    { service: pair.service, characteristic: characteristicShort },
    {
      service: pair.service,
      characteristic: toFullUuid16(characteristicShort),
    },
  ];
  const out: GattPair[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = `${candidate.service.replace(/-/g, '').toLowerCase()}|${candidate.characteristic
      .replace(/-/g, '')
      .toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(candidate);
  }
  return out;
}
