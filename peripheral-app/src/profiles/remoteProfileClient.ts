import type { BleProfile } from './types';
import { applyValueGenerators } from './applyValueGenerators';
import { REMOTE_PROFILE_API_BASE } from '../config/remoteProfileApiBase';

export type RemoteCatalogRow = {
  profileId: string;
  name: string;
  category: string;
  latestPublishedVersion: string;
  updatedAt: string;
};

export type RemoteLatestResponse = {
  profileId: string;
  version: string;
  updatedAt: string;
  profile: unknown;
};

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

/** Free ngrok often requires this for non-browser clients (e.g. React Native `fetch`). */
function tunnelFetchInit(baseUrl: string): RequestInit {
  try {
    const host = new URL(baseUrl).hostname;
    if (host.includes('ngrok')) {
      return { headers: { 'ngrok-skip-browser-warning': 'true' } };
    }
  } catch {
    /* invalid base — omit */
  }
  return {};
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j.error) {
        msg = j.error;
      }
    } catch {
      /* ignore */
    }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return JSON.parse(text) as T;
}

/** List published profiles (no auth). */
export async function fetchRemoteProfileCatalog(
  baseUrl: string = REMOTE_PROFILE_API_BASE
): Promise<RemoteCatalogRow[]> {
  const res = await fetch(
    joinUrl(baseUrl, '/api/profiles'),
    tunnelFetchInit(baseUrl)
  );
  const body = await readJson<{ profiles: RemoteCatalogRow[] }>(res);
  return body.profiles;
}

/** Latest published device document for a profile id; runs through `applyValueGenerators`. */
export async function fetchRemoteLatestBleProfile(
  profileId: string,
  baseUrl: string = REMOTE_PROFILE_API_BASE
): Promise<BleProfile> {
  const res = await fetch(
    joinUrl(baseUrl, `/api/profiles/${encodeURIComponent(profileId)}/latest`),
    tunnelFetchInit(baseUrl)
  );
  const body = await readJson<RemoteLatestResponse>(res);
  return applyValueGenerators(body.profile);
}
