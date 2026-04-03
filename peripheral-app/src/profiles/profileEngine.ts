/**
 * Profile Engine
 *
 * The core orchestrator that reads ANY profile JSON and translates it into
 * rn-ble-peripheral-module API calls. Contains ZERO profile-
 * specific logic -- all behavior is driven by the profile schema.
 *
 * Responsibilities:
 *   - Load and validate profile JSON
 *   - Register GATT services and characteristics
 *   - Start/stop advertising
 *   - Handle read/write requests (state-aware)
 *   - Manage simulation lifecycle (start/stop/reconfigure per state)
 *   - Integrate with StateMachineRunner for state transitions
 *   - Provide callbacks for UI synchronisation
 */

import {
  setName,
  startAdvertising,
  stopAdvertising,
  addService,
  removeAllServices,
  addCharacteristicToServiceBase64,
  updateValueBase64,
  respondToRequestBase64,
  onDidStartAdvertising,
  onDidAddService,
  onDidSubscribeToCharacteristic,
  onDidUnsubscribeFromCharacteristic,
  onDidReceiveReadRequest,
  onDidReceiveWriteRequests,
  ATTError,
  base64StringToDecimal,
} from 'rn-ble-peripheral-module';

import type {
  BleProfile,
  ProfileCharacteristic,
  ProfileService,
  CharacteristicRuntimeState,
  ProfileEngineCallbacks,
  SimulationConfig,
} from './types';
import {
  DIS_FIELD_MAP,
  DIS_SERVICE_UUID,
  resolveProperties,
  resolvePermissions,
  resolveATTError,
} from './types';
import { encodeInitialValue, encodeSimulationValue } from './encodingUtils';
import { SimulationRunner } from './simulationRunner';
import { StateMachineRunner } from './stateMachineRunner';

// ─── ProfileEngine Class ─────────────────────────────────────────────────────

export class ProfileEngine {
  private profile: BleProfile | null = null;
  private characteristicState = new Map<
    string,
    Map<string, CharacteristicRuntimeState>
  >();
  private writeState = new Map<string, unknown>();
  private subscriptions: Array<{ remove(): void }> = [];
  private simulationRunner = new SimulationRunner();
  private stateMachineRunner: StateMachineRunner | null = null;
  private callbacks: ProfileEngineCallbacks;
  private running = false;

  constructor(callbacks: ProfileEngineCallbacks) {
    this.callbacks = callbacks;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /** Load and validate a profile from a JSON object. */
  loadProfile(json: BleProfile): BleProfile {
    this.validateProfile(json);
    this.profile = json;
    this.callbacks.onLog(`Profile loaded: ${json.name} (${json.id})`);
    return json;
  }

  /** Execute the loaded profile: register services, start advertising, begin simulations. */
  async executeProfile(): Promise<void> {
    if (!this.profile) {
      throw new Error('No profile loaded. Call loadProfile() first.');
    }

    const profile = this.profile;
    this.running = true;

    try {
      removeAllServices();
      this.characteristicState.clear();
      this.writeState.clear();

      this.registerServices(profile.services);

      if (profile.deviceInfo) {
        this.registerDeviceInfoService(profile);
      }

      const deviceName =
        profile.advertising.deviceName || profile.advertising.localName;
      setName(deviceName);

      const serviceUUIDs =
        profile.advertising.serviceUUIDs?.slice() ||
        this.deriveServiceUUIDs(profile);

      // Note: only picking up first service UUID which must be primary, if we include all like battery+deviceinfo, its throing error for data length
      await startAdvertising({
        localName: profile.advertising.localName,
        serviceUUIDs: [serviceUUIDs[0]],
      });

      this.registerEventHandlers();

      if (profile.stateMachine) {
        this.stateMachineRunner = new StateMachineRunner(
          profile.stateMachine,
          {
            onStateChange: (from, to, trigger) =>
              this.handleStateChange(from, to, trigger),
            onLog: (msg) => this.callbacks.onLog(msg),
          }
        );

        const initialState = profile.stateMachine.initial;
        const initialDef = profile.stateMachine.states[initialState];
        if (initialDef) {
          this.callbacks.onStateChange(initialState, initialDef);
          this.applyStateOverrides(initialState);
        }
      } else {
        this.startBaseSimulations();
      }

      this.callbacks.onLog(`Profile executing: ${profile.name}`);
    } catch (error) {
      this.callbacks.onLog(
        `Failed to execute profile: ${error}`,
        'error'
      );
      throw error;
    }
  }

  /** Stop the running profile: stop advertising, remove services, clean up. */
  stopProfile(): void {
    this.running = false;

    this.simulationRunner.stopAll();
    this.stateMachineRunner?.stop();
    this.stateMachineRunner = null;

    for (const sub of this.subscriptions) {
      sub.remove();
    }
    this.subscriptions = [];

    try {
      stopAdvertising();
      removeAllServices();
    } catch {
      // Swallow errors during cleanup
    }

    this.characteristicState.clear();
    this.writeState.clear();
    this.callbacks.onLog('Profile stopped');
    this.callbacks.onAdvertisingChange(false);
  }

  /** Update a characteristic value manually (from UI controls). */
  async updateCharacteristicValue(
    serviceUUID: string,
    charUUID: string,
    rawValue: number
  ): Promise<void> {
    const state = this.getCharState(serviceUUID, charUUID);
    if (!state) {
      return;
    }

    const simConfig =
      state.definition.simulation || this.getActiveSimConfig(state);
    let encoded: string;

    if (simConfig?.encoding) {
      encoded = encodeSimulationValue(rawValue, simConfig.encoding);
    } else if (state.definition.value) {
      const valueDef = {
        ...state.definition.value,
        initial: rawValue,
      };
      encoded = encodeInitialValue(valueDef);
    } else {
      encoded = encodeInitialValue({ type: 'uint8', initial: rawValue });
    }

    state.currentValue = rawValue;
    state.encodedValue = encoded;

    this.simulationRunner.setCurrentValue(serviceUUID, charUUID, rawValue);

    try {
      await updateValueBase64(serviceUUID, charUUID, encoded);
      this.callbacks.onValueChange(serviceUUID, charUUID, rawValue);
    } catch (error) {
      this.callbacks.onLog(
        `Failed to update value: ${error}`,
        'error'
      );
    }
  }

  /** Trigger a manual state machine transition. */
  triggerManualTransition(targetStateId: string): void {
    this.stateMachineRunner?.triggerManualTransition(targetStateId);
  }

  /** Get manual transitions available from the current state. */
  getManualTransitions(): Array<{ to: string; label: string }> {
    return this.stateMachineRunner?.getManualTransitions() || [];
  }

  /** Get the current state machine state ID. */
  getCurrentState(): string | null {
    return this.stateMachineRunner?.getCurrentState() || null;
  }

  /** Get the current loaded profile. */
  getProfile(): BleProfile | null {
    return this.profile;
  }

  /** Check if a profile is currently running. */
  isRunning(): boolean {
    return this.running;
  }

  /** Get all current characteristic values for UI rendering. */
  getCharacteristicValues(): Map<string, Map<string, CharacteristicRuntimeState>> {
    return this.characteristicState;
  }

  /** Get a write state value by key. */
  getWriteState(key: string): unknown {
    return this.writeState.get(key);
  }

  // ── GATT Registration ────────────────────────────────────────────────────

  private registerServices(services: readonly ProfileService[]): void {
    for (const service of services) {
      const svcUUID = service.uuid;
      const charMap = new Map<string, CharacteristicRuntimeState>();

      // Service must be created first -- native code stores it in a map
      // that addCharacteristicToService looks up by UUID.
      addService(svcUUID, service.primary !== false);

      for (const char of service.characteristics) {
        const props = resolveProperties(char.properties);
        const perms = resolvePermissions(char.permissions);
        const encoded = encodeInitialValue(char.value);

        addCharacteristicToServiceBase64(
          svcUUID,
          char.uuid,
          props,
          perms,
          encoded
        );

        charMap.set(char.uuid.toUpperCase(), {
          currentValue: char.value?.initial ?? '',
          encodedValue: encoded,
          definition: char,
          serviceUUID: svcUUID,
          readBehavior: 'normal',
          writeBehavior: 'normal',
        });
      }

      this.characteristicState.set(svcUUID.toUpperCase(), charMap);

      this.callbacks.onLog(
        `Registered service: ${service.name || svcUUID} (${service.characteristics.length} chars)`
      );
    }
  }

  private registerDeviceInfoService(profile: BleProfile): void {
    if (!profile.deviceInfo) {
      return;
    }

    const charMap = new Map<string, CharacteristicRuntimeState>();

    addService(DIS_SERVICE_UUID, true);

    for (const [field, charUUID] of Object.entries(DIS_FIELD_MAP)) {
      const value =
        profile.deviceInfo[field as keyof typeof profile.deviceInfo] ||
        'Unknown';
      const encoded = encodeInitialValue({ type: 'string', initial: value });

      addCharacteristicToServiceBase64(
        DIS_SERVICE_UUID,
        charUUID,
        resolveProperties(['read']),
        resolvePermissions(['readable']),
        encoded
      );

      charMap.set(charUUID.toUpperCase(), {
        currentValue: value,
        encodedValue: encoded,
        definition: {
          uuid: charUUID,
          name: field,
          properties: ['read'],
          permissions: ['readable'],
          value: { type: 'string', initial: value },
        },
        serviceUUID: DIS_SERVICE_UUID,
        readBehavior: 'normal',
        writeBehavior: 'normal',
      });
    }

    this.characteristicState.set(DIS_SERVICE_UUID.toUpperCase(), charMap);
    this.callbacks.onLog('Registered Device Information Service');
  }

  // ── Event Handlers ─────────────────────────────────────────────────────

  private registerEventHandlers(): void {
    this.subscriptions.push(
      onDidStartAdvertising((event) => {
        this.callbacks.onAdvertisingChange(event.success);
        if (event.success) {
          this.callbacks.onLog('Advertising started');
        } else {
          this.callbacks.onLog(
            `Advertising failed: ${event.error}`,
            'error'
          );
        }
      })
    );

    this.subscriptions.push(
      onDidAddService((event) => {
        if (!event.success) {
          this.callbacks.onLog(
            `Failed to add service: ${event.error}`,
            'error'
          );
        }
      })
    );

    this.subscriptions.push(
      onDidReceiveReadRequest((event) => {
        this.handleReadRequest(event);
      })
    );

    this.subscriptions.push(
      onDidReceiveWriteRequests((event) => {
        this.handleWriteRequests(event);
      })
    );

    this.subscriptions.push(
      onDidSubscribeToCharacteristic((event) => {
        this.callbacks.onLog(
          `Central subscribed: ${event.characteristicUUID.substring(0, 8)}...`
        );
        this.stateMachineRunner?.handleSubscribe(event.characteristicUUID);
      })
    );

    this.subscriptions.push(
      onDidUnsubscribeFromCharacteristic((event) => {
        this.callbacks.onLog(
          `Central unsubscribed: ${event.characteristicUUID.substring(0, 8)}...`
        );
        this.stateMachineRunner?.handleUnsubscribe(event.characteristicUUID);
      })
    );
  }

  private handleReadRequest(event: {
    requestId: number;
    characteristicUUID: string;
    offset: number;
    serviceUUID?: string;
  }): void {
    const state = this.findCharState(event.characteristicUUID);
    if (!state) {
      this.callbacks.onLog(
        `Read: unknown char ${event.characteristicUUID}`,
        'error'
      );
      respondToRequestBase64(
        event.requestId,
        ATTError.InvalidHandle
      );
      return;
    }

    if (state.readBehavior === 'reject') {
      const errCode = state.rejectError
        ? resolveATTError(state.rejectError)
        : ATTError.ReadNotPermitted;
      respondToRequestBase64(event.requestId, errCode);
      this.callbacks.onLog(
        `Read rejected: ${state.definition.name || state.definition.uuid}`
      );
      return;
    }

    respondToRequestBase64(
      event.requestId,
      ATTError.Success,
      state.encodedValue
    );
    this.callbacks.onLog(
      `Read: ${state.definition.name || state.definition.uuid}`
    );
  }

  private handleWriteRequests(event: {
    requestId: number;
    requests: Array<{
      characteristicUUID: string;
      value: string;
      offset: number;
      serviceUUID?: string;
    }>;
  }): void {
    for (const req of event.requests) {
      const state = this.findCharState(req.characteristicUUID);
      if (!state) {
        continue;
      }

      if (state.writeBehavior === 'reject') {
        const errCode = state.rejectError
          ? resolveATTError(state.rejectError)
          : ATTError.WriteNotPermitted;
        respondToRequestBase64(event.requestId, errCode);
        this.callbacks.onLog(
          `Write rejected: ${state.definition.name || state.definition.uuid}`
        );
        return;
      }

      let decodedValue: number | string | boolean = 0;
      const writeAction = state.definition.onWrite;

      try {
        decodedValue = base64StringToDecimal(req.value);
      } catch {
        decodedValue = 0;
      }

      if (state.writeBehavior === 'log') {
        this.callbacks.onLog(
          `Write (log-only): ${state.definition.name || state.definition.uuid} = ${decodedValue}`
        );
        respondToRequestBase64(event.requestId, ATTError.Success);
        return;
      }

      state.encodedValue = req.value;
      state.currentValue =
        typeof decodedValue === 'number' ? decodedValue : 0;

      if (writeAction) {
        const decoded = this.decodeWriteValue(
          decodedValue,
          writeAction.decode
        );

        if (writeAction.action === 'updateState' && writeAction.stateKey) {
          this.writeState.set(writeAction.stateKey, decoded);
          this.callbacks.onWriteStateChange(writeAction.stateKey, decoded);
          this.callbacks.onLog(
            `Write: ${writeAction.stateKey} = ${decoded}`
          );
        } else {
          this.callbacks.onLog(
            `Write: ${state.definition.name || state.definition.uuid} = ${decoded}`
          );
        }

        if (typeof decodedValue === 'number') {
          this.stateMachineRunner?.handleWrite(
            req.characteristicUUID,
            decodedValue
          );
        }
      } else {
        this.callbacks.onLog(
          `Write: ${state.definition.name || state.definition.uuid} = ${decodedValue}`
        );
      }

      this.callbacks.onValueChange(
        state.serviceUUID,
        state.definition.uuid,
        state.currentValue
      );
    }

    respondToRequestBase64(event.requestId, ATTError.Success);
  }

  // ── State Machine Integration ──────────────────────────────────────────

  private handleStateChange(
    _fromState: string,
    toState: string,
    _trigger: unknown
  ): void {
    if (!this.running || !this.profile) {
      return;
    }

    this.applyStateOverrides(toState);

    const stateDef = this.profile.stateMachine?.states[toState];
    if (stateDef) {
      this.callbacks.onStateChange(toState, stateDef);
    }
  }

  private applyStateOverrides(stateId: string): void {
    if (!this.profile) {
      return;
    }

    this.simulationRunner.stopAll();

    for (const service of this.profile.services) {
      for (const char of service.characteristics) {
        const charState = this.getCharState(service.uuid, char.uuid);
        if (!charState) {
          continue;
        }

        const override = char.stateOverrides?.[stateId];

        charState.readBehavior = override?.readBehavior || 'normal';
        charState.writeBehavior = override?.writeBehavior || 'normal';
        charState.rejectError = override?.rejectError;

        if (override?.value) {
          const encoded = encodeInitialValue(override.value);
          charState.encodedValue = encoded;
          charState.currentValue = override.value.initial;

          updateValueBase64(service.uuid, char.uuid, encoded).catch(() => {});
          this.callbacks.onValueChange(
            service.uuid,
            char.uuid,
            override.value.initial
          );
        }

        const simConfig = override?.simulation || char.simulation;
        if (simConfig?.enabled) {
          const startValue =
            typeof charState.currentValue === 'number'
              ? charState.currentValue
              : simConfig.min;

          this.simulationRunner.start(
            service.uuid,
            char.uuid,
            simConfig,
            startValue,
            (svcUUID, chUUID, encoded, numericValue) => {
              this.handleSimulationTick(
                svcUUID,
                chUUID,
                encoded,
                numericValue
              );
            }
          );
        }
      }
    }
  }

  private startBaseSimulations(): void {
    if (!this.profile) {
      return;
    }

    for (const service of this.profile.services) {
      for (const char of service.characteristics) {
        if (char.simulation?.enabled) {
          const initialValue =
            typeof char.value?.initial === 'number'
              ? char.value.initial
              : char.simulation.min;

          this.simulationRunner.start(
            service.uuid,
            char.uuid,
            char.simulation,
            initialValue,
            (svcUUID, chUUID, encoded, numericValue) => {
              this.handleSimulationTick(
                svcUUID,
                chUUID,
                encoded,
                numericValue
              );
            }
          );
        }
      }
    }
  }

  private handleSimulationTick(
    serviceUUID: string,
    charUUID: string,
    encoded: string,
    numericValue: number
  ): void {
    const state = this.getCharState(serviceUUID, charUUID);
    if (!state) {
      return;
    }

    state.currentValue = numericValue;
    state.encodedValue = encoded;

    updateValueBase64(serviceUUID, charUUID, encoded).catch(() => {});
    this.callbacks.onValueChange(serviceUUID, charUUID, numericValue);
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private getCharState(
    serviceUUID: string,
    charUUID: string
  ): CharacteristicRuntimeState | undefined {
    return this.characteristicState
      .get(serviceUUID.toUpperCase())
      ?.get(charUUID.toUpperCase());
  }

  /** Find a characteristic state by UUID across all services. */
  private findCharState(
    charUUID: string
  ): CharacteristicRuntimeState | undefined {
    const upper = charUUID.toUpperCase();
    for (const charMap of this.characteristicState.values()) {
      const state = charMap.get(upper);
      if (state) {
        return state;
      }
    }
    return undefined;
  }

  private getActiveSimConfig(
    state: CharacteristicRuntimeState
  ): SimulationConfig | undefined {
    if (!this.stateMachineRunner || !this.profile) {
      return state.definition.simulation ?? undefined;
    }
    const currentStateId = this.stateMachineRunner.getCurrentState();
    const override = state.definition.stateOverrides?.[currentStateId];
    return override?.simulation || state.definition.simulation || undefined;
  }

  private deriveServiceUUIDs(profile: BleProfile): string[] {
    const uuids = profile.services.map((s) => s.uuid);
    if (profile.deviceInfo) {
      uuids.push(DIS_SERVICE_UUID);
    }
    return uuids;
  }

  private decodeWriteValue(
    rawValue: number | string | boolean,
    decode?: string
  ): unknown {
    switch (decode) {
      case 'boolean':
        return rawValue !== 0;
      case 'string':
        return String(rawValue);
      case 'uint8':
      default:
        return typeof rawValue === 'number' ? rawValue : 0;
    }
  }

  // ── Validation ─────────────────────────────────────────────────────────

  private validateProfile(profile: BleProfile): void {
    if (!profile.id) {
      throw new Error('Profile missing required field: id');
    }
    if (!profile.name) {
      throw new Error('Profile missing required field: name');
    }
    if (!profile.advertising?.localName) {
      throw new Error('Profile missing required field: advertising.localName');
    }
    if (!profile.services || profile.services.length === 0) {
      throw new Error('Profile must have at least one service');
    }

    for (const service of profile.services) {
      if (!service.uuid) {
        throw new Error('Service missing required field: uuid');
      }
      if (
        !service.characteristics ||
        service.characteristics.length === 0
      ) {
        throw new Error(
          `Service ${service.uuid} must have at least one characteristic`
        );
      }
      for (const char of service.characteristics) {
        this.validateCharacteristic(char);
      }
    }

    if (profile.stateMachine) {
      this.validateStateMachine(profile);
    }
  }

  private validateCharacteristic(char: ProfileCharacteristic): void {
    if (!char.uuid) {
      throw new Error('Characteristic missing required field: uuid');
    }
    if (!char.properties || char.properties.length === 0) {
      throw new Error(
        `Characteristic ${char.uuid} missing required field: properties`
      );
    }
    if (!char.permissions || char.permissions.length === 0) {
      throw new Error(
        `Characteristic ${char.uuid} missing required field: permissions`
      );
    }

    resolveProperties(char.properties);
    resolvePermissions(char.permissions);
  }

  private validateStateMachine(profile: BleProfile): void {
    const sm = profile.stateMachine!;
    const stateIds = new Set(Object.keys(sm.states));

    if (!stateIds.has(sm.initial)) {
      throw new Error(
        `State machine initial "${sm.initial}" not in states: ${[...stateIds].join(', ')}`
      );
    }

    for (const [stateId, state] of Object.entries(sm.states)) {
      for (const transition of state.transitions) {
        if (!stateIds.has(transition.to)) {
          throw new Error(
            `State "${stateId}" transitions to unknown state "${transition.to}"`
          );
        }
      }
    }

    for (const service of profile.services) {
      for (const char of service.characteristics) {
        if (char.stateOverrides) {
          for (const overrideState of Object.keys(char.stateOverrides)) {
            if (!stateIds.has(overrideState)) {
              throw new Error(
                `Characteristic ${char.uuid} has stateOverride for unknown state "${overrideState}". Valid: ${[...stateIds].join(', ')}`
              );
            }
          }
        }
      }
    }
  }
}
