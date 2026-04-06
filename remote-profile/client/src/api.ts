const prefix = import.meta.env.VITE_API_URL ?? '';

function headers(auth?: string | null): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    h.Authorization = `Bearer ${auth}`;
  }
  return h;
}

async function parseError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function login(email: string, password: string): Promise<{ token: string }> {
  const res = await fetch(`${prefix}/api/auth/login`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  return res.json() as Promise<{ token: string }>;
}

export type PublicProfileRow = {
  profileId: string;
  name: string;
  category: string;
  latestPublishedVersion: string;
  updatedAt: string;
};

export type StoredProfile = {
  profileId: string;
  name: string;
  category: string;
  notes?: string;
  versions: Array<{
    version: string;
    status: 'draft' | 'published';
    updatedAt: string;
    changelog?: string;
    metadata?: Record<string, unknown>;
    document: Record<string, unknown>;
  }>;
};

export async function fetchProfiles(
  token: string | null
): Promise<{ profiles: StoredProfile[] | PublicProfileRow[] }> {
  const res = await fetch(`${prefix}/api/profiles`, {
    headers: headers(token ?? undefined),
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  return res.json() as Promise<{ profiles: StoredProfile[] | PublicProfileRow[] }>;
}

export async function fetchProfileDetail(
  token: string,
  profileId: string
): Promise<StoredProfile> {
  const res = await fetch(`${prefix}/api/profiles/${encodeURIComponent(profileId)}`, {
    headers: headers(token),
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  return res.json() as Promise<StoredProfile>;
}

export async function createProfile(
  token: string,
  body: {
    profileId: string;
    name: string;
    category: string;
    notes?: string;
    document: Record<string, unknown>;
    version?: string;
    status?: 'draft' | 'published';
  }
): Promise<StoredProfile> {
  const res = await fetch(`${prefix}/api/profiles`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  return res.json() as Promise<StoredProfile>;
}

export async function updateProfileVersion(
  token: string,
  profileId: string,
  version: string,
  body: Record<string, unknown>
): Promise<StoredProfile> {
  const res = await fetch(
    `${prefix}/api/profiles/${encodeURIComponent(profileId)}/${encodeURIComponent(version)}`,
    {
      method: 'PUT',
      headers: headers(token),
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  return res.json() as Promise<StoredProfile>;
}

export async function cloneProfileVersion(
  token: string,
  profileId: string,
  version: string,
  targetVersion: string,
  changelog?: string
): Promise<StoredProfile> {
  const res = await fetch(
    `${prefix}/api/profiles/${encodeURIComponent(profileId)}/${encodeURIComponent(version)}/clone`,
    {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({ targetVersion, changelog }),
    }
  );
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
  return res.json() as Promise<StoredProfile>;
}

export async function deleteProfileVersion(
  token: string,
  profileId: string,
  version: string
): Promise<void> {
  const res = await fetch(
    `${prefix}/api/profiles/${encodeURIComponent(profileId)}/${encodeURIComponent(version)}`,
    {
      method: 'DELETE',
      headers: headers(token),
    }
  );
  if (!res.ok && res.status !== 204) {
    throw new Error(await parseError(res));
  }
}

export async function deleteProfile(token: string, profileId: string): Promise<void> {
  const res = await fetch(`${prefix}/api/profiles/${encodeURIComponent(profileId)}`, {
    method: 'DELETE',
    headers: headers(token),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(await parseError(res));
  }
}
