/**
 * Best-effort ordering for version labels like "1", "2", "1.0", "10".
 * Published "latest" picks the greatest by this ordering.
 */
export function compareVersion(a: string, b: string): number {
  const pa = a.split(/[.\-]/).map((p) => {
    const n = parseInt(p, 10);
    return Number.isFinite(n) ? n : p;
  });
  const pb = b.split(/[.\-]/).map((p) => {
    const n = parseInt(p, 10);
    return Number.isFinite(n) ? n : p;
  });
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i];
    const y = pb[i];
    if (x === undefined) {
      return -1;
    }
    if (y === undefined) {
      return 1;
    }
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) {
        return x < y ? -1 : 1;
      }
    } else {
      const xs = String(x);
      const ys = String(y);
      if (xs !== ys) {
        return xs < ys ? -1 : xs > ys ? 1 : 0;
      }
    }
  }
  return 0;
}
