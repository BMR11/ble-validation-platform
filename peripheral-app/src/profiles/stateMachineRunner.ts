/**
 * State Machine Runner
 *
 * Manages the current device state and evaluates transition triggers.
 * Fully generic -- reads the ProfileStateMachine config and acts on it
 * without knowing what the states represent.
 *
 * Supported trigger types:
 *   manual, onSubscribe, onUnsubscribe, onWrite, timer
 */

import type {
  ProfileStateMachine,
  StateDefinition,
  StateTransition,
  TransitionTrigger,
} from './types';

// ─── Callback Interface ─────────────────────────────────────────────────────

export interface StateMachineCallbacks {
  /** Called when the state changes -- engine applies stateOverrides here. */
  onStateChange: (
    fromState: string,
    toState: string,
    trigger: TransitionTrigger
  ) => void;
  onLog: (message: string) => void;
}

// ─── StateMachineRunner Class ────────────────────────────────────────────────

export class StateMachineRunner {
  private readonly stateMachine: ProfileStateMachine;
  private readonly callbacks: StateMachineCallbacks;
  private currentStateId: string;
  private timerHandle: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    stateMachine: ProfileStateMachine,
    callbacks: StateMachineCallbacks
  ) {
    this.stateMachine = stateMachine;
    this.callbacks = callbacks;
    this.currentStateId = stateMachine.initial;
    this.validateStateMachine();
    this.setupTimerTransitions();
  }

  // ── Public API ───────────────────────────────────────────────────────────

  getCurrentState(): string {
    return this.currentStateId;
  }

  getCurrentStateDefinition(): StateDefinition {
    return this.stateMachine.states[this.currentStateId]!;
  }

  /** Get manual transitions available from the current state (for UI buttons). */
  getManualTransitions(): Array<{ to: string; label: string }> {
    const state = this.stateMachine.states[this.currentStateId];
    if (!state) {
      return [];
    }
    return state.transitions
      .filter((t) => t.trigger.type === 'manual')
      .map((t) => ({
        to: t.to,
        label:
          t.label ||
          `Go to ${this.stateMachine.states[t.to]?.name || t.to}`,
      }));
  }

  /** Evaluate a subscribe event. */
  handleSubscribe(characteristicUUID: string): void {
    this.evaluateTransitions((trigger) => {
      if (trigger.type !== 'onSubscribe') {
        return false;
      }
      return (
        !trigger.characteristicUUID ||
        trigger.characteristicUUID.toUpperCase() ===
          characteristicUUID.toUpperCase()
      );
    });
  }

  /** Evaluate an unsubscribe event. */
  handleUnsubscribe(characteristicUUID: string): void {
    this.evaluateTransitions((trigger) => {
      if (trigger.type !== 'onUnsubscribe') {
        return false;
      }
      return (
        !trigger.characteristicUUID ||
        trigger.characteristicUUID.toUpperCase() ===
          characteristicUUID.toUpperCase()
      );
    });
  }

  /** Evaluate a write event. */
  handleWrite(characteristicUUID: string, decodedValue: number): void {
    this.evaluateTransitions((trigger) => {
      if (trigger.type !== 'onWrite') {
        return false;
      }
      if (
        trigger.characteristicUUID.toUpperCase() !==
        characteristicUUID.toUpperCase()
      ) {
        return false;
      }
      return trigger.value === undefined || trigger.value === decodedValue;
    });
  }

  /** Trigger a manual transition to a specific target state. */
  triggerManualTransition(targetStateId: string): void {
    const state = this.stateMachine.states[this.currentStateId];
    if (!state) {
      return;
    }

    const transition = state.transitions.find(
      (t) => t.trigger.type === 'manual' && t.to === targetStateId
    );

    if (!transition) {
      this.callbacks.onLog(
        `No manual transition from "${this.currentStateId}" to "${targetStateId}"`
      );
      return;
    }

    this.executeTransition(transition);
  }

  /** Clean up all timers. */
  stop(): void {
    this.stopped = true;
    this.clearTimer();
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private validateStateMachine(): void {
    const { initial, states } = this.stateMachine;

    if (!states[initial]) {
      throw new Error(
        `State machine initial state "${initial}" not found in states: ${Object.keys(states).join(', ')}`
      );
    }

    for (const [stateId, state] of Object.entries(states)) {
      for (const transition of state.transitions) {
        if (!states[transition.to]) {
          throw new Error(
            `State "${stateId}" has transition to unknown state "${transition.to}". Valid: ${Object.keys(states).join(', ')}`
          );
        }
      }
    }
  }

  private evaluateTransitions(
    matchFn: (trigger: TransitionTrigger) => boolean
  ): void {
    if (this.stopped) {
      return;
    }
    const state = this.stateMachine.states[this.currentStateId];
    if (!state) {
      return;
    }
    const transition = state.transitions.find((t) => matchFn(t.trigger));
    if (transition) {
      this.executeTransition(transition);
    }
  }

  private executeTransition(transition: StateTransition): void {
    if (this.stopped) {
      return;
    }

    const fromState = this.currentStateId;
    const toState = transition.to;

    this.clearTimer();
    this.currentStateId = toState;

    const toStateDef = this.stateMachine.states[toState];
    this.callbacks.onLog(
      `State: ${fromState} -> ${toState} (${toStateDef?.name || toState})`
    );
    this.callbacks.onStateChange(fromState, toState, transition.trigger);
    this.setupTimerTransitions();
  }

  private setupTimerTransitions(): void {
    const state = this.stateMachine.states[this.currentStateId];
    if (!state) {
      return;
    }

    const timerTransition = state.transitions.find(
      (t) => t.trigger.type === 'timer'
    );

    if (timerTransition && timerTransition.trigger.type === 'timer') {
      this.timerHandle = setTimeout(() => {
        this.executeTransition(timerTransition);
      }, timerTransition.trigger.delayMs);
    }
  }

  private clearTimer(): void {
    if (this.timerHandle !== null) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
  }
}
