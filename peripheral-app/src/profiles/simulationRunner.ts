/**
 * Simulation Runner
 *
 * Manages setInterval timers that auto-generate characteristic values.
 * Each simulation runs independently and produces encoded values via
 * the onTick callback. State-aware: simulations can be started, stopped,
 * paused, and reconfigured in response to state machine transitions.
 *
 * This module is fully generic -- it has no knowledge of specific
 * profiles, services, or characteristics.
 */

import type { SimulationConfig } from './types';
import { encodeSimulationValue } from './encodingUtils';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Called each time a simulation generates a new value. */
export type OnTickCallback = (
  serviceUUID: string,
  charUUID: string,
  encodedValue: string,
  numericValue: number
) => void;

interface SimulationEntry {
  serviceUUID: string;
  charUUID: string;
  config: SimulationConfig;
  currentValue: number;
  tickCount: number;
  timerId: ReturnType<typeof setInterval> | null;
  paused: boolean;
  onTick: OnTickCallback;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeKey(serviceUUID: string, charUUID: string): string {
  return `${serviceUUID.toUpperCase()}::${charUUID.toUpperCase()}`;
}

function generateNextValue(entry: SimulationEntry): number {
  const { config, currentValue, tickCount } = entry;
  const { type, min, max, step = 1 } = config;

  switch (type) {
    case 'randomRange':
      return Math.floor(Math.random() * (max - min + 1)) + min;

    case 'randomWalk': {
      const direction = Math.random() > 0.5 ? 1 : -1;
      return Math.max(min, Math.min(max, currentValue + direction * step));
    }

    case 'increment': {
      const next = currentValue + step;
      return next > max ? min : next;
    }

    case 'decrement': {
      const next = currentValue - step;
      return next < min ? max : next;
    }

    case 'sine': {
      const mid = (min + max) / 2;
      const amplitude = (max - min) / 2;
      const period = Math.max(1, ((max - min) / step) * 2);
      return Math.round(
        mid + amplitude * Math.sin((tickCount * 2 * Math.PI) / period)
      );
    }

    default:
      return currentValue;
  }
}

// ─── SimulationRunner Class ──────────────────────────────────────────────────

export class SimulationRunner {
  private simulations = new Map<string, SimulationEntry>();

  /**
   * Start a simulation for a specific characteristic.
   * If one already exists for this key, it is stopped first.
   */
  start(
    serviceUUID: string,
    charUUID: string,
    config: SimulationConfig,
    initialValue: number,
    onTick: OnTickCallback
  ): void {
    const key = makeKey(serviceUUID, charUUID);
    this.stop(serviceUUID, charUUID);

    if (!config.enabled) {
      return;
    }

    const entry: SimulationEntry = {
      serviceUUID,
      charUUID,
      config,
      currentValue: initialValue,
      tickCount: 0,
      timerId: null,
      paused: false,
      onTick,
    };

    entry.timerId = setInterval(() => {
      if (entry.paused) {
        return;
      }
      entry.tickCount++;
      const nextValue = generateNextValue(entry);
      entry.currentValue = nextValue;
      const encoded = encodeSimulationValue(nextValue, config.encoding);
      entry.onTick(serviceUUID, charUUID, encoded, nextValue);
    }, config.intervalMs);

    this.simulations.set(key, entry);
  }

  /** Stop a specific simulation. */
  stop(serviceUUID: string, charUUID: string): void {
    const key = makeKey(serviceUUID, charUUID);
    const entry = this.simulations.get(key);
    if (entry?.timerId) {
      clearInterval(entry.timerId);
    }
    this.simulations.delete(key);
  }

  /** Stop all running simulations. */
  stopAll(): void {
    for (const entry of this.simulations.values()) {
      if (entry.timerId) {
        clearInterval(entry.timerId);
      }
    }
    this.simulations.clear();
  }

  /** Pause a specific simulation (for manual override). */
  pause(serviceUUID: string, charUUID: string): void {
    const entry = this.simulations.get(makeKey(serviceUUID, charUUID));
    if (entry) {
      entry.paused = true;
    }
  }

  /** Resume a paused simulation. */
  resume(serviceUUID: string, charUUID: string): void {
    const entry = this.simulations.get(makeKey(serviceUUID, charUUID));
    if (entry) {
      entry.paused = false;
    }
  }

  /** Update the current value so the next tick starts from here. */
  setCurrentValue(
    serviceUUID: string,
    charUUID: string,
    value: number
  ): void {
    const entry = this.simulations.get(makeKey(serviceUUID, charUUID));
    if (entry) {
      entry.currentValue = value;
    }
  }

  /** Check if a simulation is currently running for a characteristic. */
  isRunning(serviceUUID: string, charUUID: string): boolean {
    return this.simulations.has(makeKey(serviceUUID, charUUID));
  }

  /** Number of active simulations. */
  get activeCount(): number {
    return this.simulations.size;
  }
}
