/** Normalize BLE UUIDs for comparisons (strip hyphens, lowercase). */
export function normUuid(uuid: string): string {
  return uuid.replace(/-/g, '').toLowerCase();
}

/** 16-bit short UUID (e.g. 180D) → full 128-bit Bluetooth base UUID. */
export function toFullUuid16(short: string): string {
  const s = short.replace(/-/g, '').toLowerCase();
  if (s.length <= 4) {
    const padded = s.padStart(4, '0');
    return `0000${padded}-0000-1000-8000-00805f9b34fb`;
  }
  return short.toLowerCase();
}

// convert full 0000${padded}-0000-1000-8000-00805f9b34fb to short padded
export function toShortUuid4(full: string): string {
  return full.substring(4, 8);
}

/**
 * 16-bit UUID id (e.g. `180d`, `2a37`) for comparisons when the stack returns
 * short or 128-bit BLE UUID strings.
 */
export function uuidShort16(uuid: string): string {
  const n = normUuid(uuid);
  if (n.length <= 4) {
    return n.padStart(4, '0');
  }
  return n.substring(4, 8);
}
