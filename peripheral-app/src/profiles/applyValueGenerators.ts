/**
 * Maps profile JSON `valueGenerator` string keys to concrete simulation / override
 * blocks consumed by ProfileEngine. Keeps JSON small and centralizes tuning in TS.
 */

import type {
  BleProfile,
  ProfileCharacteristic,
  ProfileService,
} from './types';

type RawCharacteristic = ProfileCharacteristic & { valueGenerator?: string };

type CharacteristicPatch = Partial<
  Omit<RawCharacteristic, 'valueGenerator'>
>;

const HR_ENCODING = {
  type: 'uint8Array' as const,
  prefix: [0],
};

const VALUE_GENERATOR_REGISTRY: Record<string, () => CharacteristicPatch> = {
  heartRateMeasurement: () => ({
    simulation: {
      enabled: false,
      type: 'randomWalk',
      intervalMs: 1000,
      min: 60,
      max: 120,
      step: 2,
      encoding: HR_ENCODING,
    },
    stateOverrides: {
      active: {
        simulation: {
          enabled: true,
          type: 'randomWalk',
          intervalMs: 1000,
          min: 60,
          max: 120,
          step: 2,
          encoding: HR_ENCODING,
        },
      },
      error: {
        value: { type: 'uint8Array', initial: [0, 0] },
        simulation: {
          enabled: false,
          type: 'randomWalk',
          intervalMs: 1000,
          min: 0,
          max: 0,
          step: 0,
          encoding: HR_ENCODING,
        },
      },
    },
  }),

  batteryDecrement: () => ({
    simulation: {
      enabled: false,
      type: 'decrement',
      intervalMs: 30000,
      min: 0,
      max: 100,
      step: 1,
      encoding: { type: 'uint8' },
    },
    stateOverrides: {
      active: {
        simulation: {
          enabled: true,
          type: 'decrement',
          intervalMs: 30000,
          min: 0,
          max: 100,
          step: 1,
          encoding: { type: 'uint8' },
        },
      },
    },
  }),
};

function applyCharacteristic(char: RawCharacteristic): ProfileCharacteristic {
  const key = char.valueGenerator;
  if (!key) {
    const { valueGenerator: _omit, ...rest } = char;
    return rest as ProfileCharacteristic;
  }

  const factory = VALUE_GENERATOR_REGISTRY[key];
  if (!factory) {
    throw new Error(
      `Unknown valueGenerator "${key}". Valid: ${Object.keys(VALUE_GENERATOR_REGISTRY).join(', ')}`
    );
  }

  const patch = factory();
  const { valueGenerator: _omit, ...base } = char;
  return { ...base, ...patch } as ProfileCharacteristic;
}

function applyService(service: ProfileService): ProfileService {
  return {
    ...service,
    characteristics: service.characteristics.map((c) =>
      applyCharacteristic(c as RawCharacteristic)
    ),
  };
}

/** Expand `valueGenerator` keys into engine-ready characteristic definitions. */
export function applyValueGenerators(raw: unknown): BleProfile {
  const profile = raw as BleProfile;
  const services = profile.services.map((s) => applyService(s as ProfileService));
  return { ...profile, services };
}
