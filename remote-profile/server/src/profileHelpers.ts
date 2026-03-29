import type { ProfileVersionRecord, StoredProfile } from './types.js';
import { compareVersion } from './versionSort.js';

export function getPublishedVersions(p: StoredProfile): ProfileVersionRecord[] {
  return p.versions.filter((v) => v.status === 'published');
}

export function pickLatestPublished(p: StoredProfile): ProfileVersionRecord | undefined {
  const pub = getPublishedVersions(p);
  if (pub.length === 0) {
    return undefined;
  }
  return [...pub].sort((a, b) => compareVersion(a.version, b.version)).at(-1);
}

export function findVersion(
  p: StoredProfile,
  version: string
): ProfileVersionRecord | undefined {
  return p.versions.find((v) => v.version === version);
}
