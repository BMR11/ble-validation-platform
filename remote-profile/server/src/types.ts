export type VersionStatus = 'draft' | 'published';

export interface ProfileVersionRecord {
  version: string;
  status: VersionStatus;
  updatedAt: string;
  changelog?: string;
  metadata?: Record<string, unknown>;
  /** Full BLE profile JSON (same shape as `profiles/local/*.json`). */
  document: Record<string, unknown>;
}

export interface StoredProfile {
  profileId: string;
  name: string;
  category: string;
  notes?: string;
  versions: ProfileVersionRecord[];
}

export interface DemoUser {
  id: string;
  email: string;
  password: string;
}

export interface AppStore {
  users: DemoUser[];
  profiles: StoredProfile[];
}
