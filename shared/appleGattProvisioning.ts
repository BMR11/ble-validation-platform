/**
 * Apple peripheral provisioning for system-owned GATT services.
 *
 * iOS and macOS publish Battery (0x180F) and Device Information (0x180A)
 * for the host itself. CoreBluetooth does not let an app replace those
 * values: a CBPeripheralManager service with the SIG UUID is overridden
 * by bluetoothd, and centrals read the Mac or iPhone instead of the profile.
 *
 * There is no public API to opt out. The supported approach is to publish
 * the same characteristics under a 128-bit UUID that is not the Bluetooth
 * SIG base (0000xxxx-0000-1000-8000-00805F9B34FB). Characteristic UUIDs
 * such as Battery Level (0x2A19) stay on the SIG base; the override is the
 * service, not the characteristic type.
 *
 * Keep this file in sync with
 * local_modules/rn-ble-peripheral-module/ios/AppleGattProvisioning.swift.
 */

export const APPLE_GATT_VENDOR_NODE = 'b1e000000000';

/** SIG assigned numbers the OS publishes for the host device. */
export const APPLE_SYSTEM_OWNED_SERVICE_SHORTS = ['180a', '180f'] as const;

/**
 * Read-only GATT catalog added by the native peripheral when at least one
 * system-owned service was rewritten. Value is JSON
 * `{"180A":"<alias>","180F":"<alias>"}`.
 */
export const APPLE_GATT_CATALOG_SERVICE_UUID =
  'f1b0a001-b1e0-4000-8000-00805f9b34fb';

export const APPLE_GATT_CATALOG_CHARACTERISTIC_UUID =
  'f1b0a002-b1e0-4000-8000-00805f9b34fb';

const SIG_BASE_REST = '00001000800000805f9b34fb';

export function isApplePeripheralHost(os: string): boolean {
  return os === 'ios' || os === 'macos';
}

function hexUuid(uuid: string): string {
  return uuid.replace(/[{}]/g, '').replace(/-/g, '').trim().toLowerCase();
}

/**
 * Assigned 16-bit number for a SIG short or SIG-base 128-bit UUID.
 * Returns null for this platform's Apple aliases — those share the first
 * 32 bits with the SIG UUID but must not be treated as 0x180A / 0x180F.
 */
export function sigAssignedShort(uuid: string): string | null {
  const hex = hexUuid(uuid);
  if (/^[0-9a-f]{4}$/.test(hex)) {
    return hex;
  }
  if (hex.length === 32 && hex.startsWith('0000') && hex.slice(8) === SIG_BASE_REST) {
    return hex.slice(4, 8);
  }
  return null;
}

export function appleAliasUuid(shortOrUuid: string): string {
  const hex = hexUuid(shortOrUuid);
  const assigned =
    hex.length === 32 ? hex.slice(4, 8) : hex.padStart(4, '0').slice(-4);
  return `0000${assigned}-0000-1000-8000-${APPLE_GATT_VENDOR_NODE}`;
}

/** Alias used on Apple peripheral hosts, or null when the UUID is not system-owned. */
export function applePublishedServiceUuid(uuid: string): string | null {
  const short = sigAssignedShort(uuid);
  if (
    !short ||
    !APPLE_SYSTEM_OWNED_SERVICE_SHORTS.includes(
      short as (typeof APPLE_SYSTEM_OWNED_SERVICE_SHORTS)[number]
    )
  ) {
    return null;
  }
  return appleAliasUuid(short);
}

export function isAppleAliasForShort(uuid: string, short: string): boolean {
  return hexUuid(uuid) === hexUuid(appleAliasUuid(short));
}

export function uuidMatchesAssignedShort(uuid: string, short: string): boolean {
  const assigned = sigAssignedShort(uuid);
  if (!assigned) {
    return false;
  }
  const wantHex = hexUuid(short);
  const want =
    wantHex.length === 32
      ? wantHex.slice(4, 8)
      : wantHex.padStart(4, '0').slice(-4);
  return assigned === want;
}

/**
 * True when both strings are the same UUID, including SIG short vs SIG-base
 * 128-bit forms. An Apple alias is not the same as the SIG service it replaces.
 */
export function sameGattUuid(a: string, b: string): boolean {
  if (hexUuid(a) === hexUuid(b)) {
    return true;
  }
  const aShort = sigAssignedShort(a);
  const bShort = sigAssignedShort(b);
  return Boolean(aShort && bShort && aShort === bShort);
}

/** Stable catalog payload. Keys are uppercase assigned numbers. */
export function appleProvisioningCatalogJson(
  published: Readonly<Record<string, string>>
): string {
  const parts = Object.keys(published)
    .sort()
    .map((key) => `"${key}":"${published[key]}"`);
  return `{${parts.join(',')}}`;
}
