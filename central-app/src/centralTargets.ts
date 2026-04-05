/**
 * Scan/connect targets aligned with `profiles/local/*.json` in the repo root.
 */

import { Platform } from 'react-native';
import { toFullUuid16, toShortUuid4 } from './uuid';

export type DemoTargetId = 'heart-rate-monitor' | 'nordic-lbs';
const isiOS = Platform.OS === 'ios';
export interface DemoTarget {
  readonly id: DemoTargetId;
  readonly label: string;
  /** Hints for filtering scan results (advertised / GAP name). */
  readonly nameHints: readonly string[];
  /** Primary service UUID for scan filter (full 128-bit). */
  readonly scanServiceUuid: string;
  readonly services: {
    readonly heartRate?: { service: string; measurement: string };
    readonly battery?: { service: string; level: string };
    readonly lbs?: { service: string; button: string; led: string };
  };
}

export const DEMO_TARGETS: Record<DemoTargetId, DemoTarget> = {
  'heart-rate-monitor': {
    id: 'heart-rate-monitor',
    /** 💓 — keep in sync with `profiles/local/heart-rate.json` `name`. */
    label: '💓 Heart Rate Monitor',
    nameHints: ['rn_ble_hr_demo'],
    scanServiceUuid: toFullUuid16('180D'),
    services: {
      heartRate: {
        service: toFullUuid16('180D'),
        measurement: toFullUuid16('2A37'),
      },
      battery: {
        service: isiOS ? '180F' : toFullUuid16('180F'),// For iOS we need shortformat, for android we need full format
        level: isiOS ? '2A19' : toFullUuid16('2A19'),// For iOS we need shortformat, for android we need full format 
      },
    },
  },
  'nordic-lbs': {
    id: 'nordic-lbs',
    /** ⚡ — keep in sync with `profiles/local/nordic-lbs.json` `name`. */
    label: '⚡ Nordic LED Button Service',
    nameHints: ['my_lbs'],
    scanServiceUuid: '00001523-1212-efde-1523-785feabcd123',
    services: {
      lbs: {
        service: '00001523-1212-efde-1523-785feabcd123',
        button: '00001524-1212-efde-1523-785feabcd123',
        led: '00001525-1212-efde-1523-785feabcd123',
      },
      battery: {
        service: isiOS ? '180F' : toFullUuid16('180F'),// For iOS we need shortformat, for android we need full format
        level: isiOS ? '2A19' : toFullUuid16('2A19'),// For iOS we need shortformat, for android we need full format
      },
    },
  },
};
