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
