/**
 * Loads JSON profiles from the repo-level `profiles/local/` directory and expands
 * `valueGenerator` references before the engine runs.
 */

import type { BleProfile } from './types';
import { applyValueGenerators } from './applyValueGenerators';
import heartRate from '../../../profiles/local/heart-rate.json';
import nordicLbs from '../../../profiles/local/nordic-lbs.json';

export const BUNDLED_PROFILES: BleProfile[] = [
  applyValueGenerators(heartRate),
  applyValueGenerators(nordicLbs),
];

export function getProfileById(id: string): BleProfile | undefined {
  return BUNDLED_PROFILES.find((p) => p.id === id);
}

export function getProfileNames(): Array<{
  id: string;
  name: string;
  description?: string;
}> {
  return BUNDLED_PROFILES.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
  }));
}
