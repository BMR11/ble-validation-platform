/**
 * Profile App
 *
 * JSON-driven BLE peripheral UI. Renders dynamic controls,
 * state machine indicators, and simulation controls based
 * entirely on the loaded profile definition.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Platform,
  PermissionsAndroid,
  Switch,
  StyleSheet,
} from 'react-native';
import {
  ManagerState,
  onDidUpdateState,
  getStateDescription,
  type EventDidUpdateState,
} from 'react-native-ble-peripheral-manager';

import { ProfileEngine } from './profiles/profileEngine';
import { BUNDLED_PROFILES } from './profiles/profileRegistry';
import type {
  BleProfile,
  ProfileCharacteristic,
  StateDefinition,
  UiHint,
} from './profiles/types';
import type { LogEntry } from './types/log';
import { appStyles } from './styles/appStyles';
import { DebugLogPanel } from './components/DebugLogPanel';

export default function ProfileApp() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logIdRef = useRef(0);

  const [currentManagerState, setCurrentManagerState] = useState<number>(
    ManagerState.Unknown
  );
  const [isAdvertising, setIsAdvertising] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<BleProfile | null>(
    null
  );
  const [activeProfile, setActiveProfile] = useState<BleProfile | null>(null);
  const [charValues, setCharValues] = useState<Map<string, number | number[] | string>>(
    new Map()
  );
  const [writeStateMap, setWriteStateMap] = useState<Map<string, unknown>>(
    new Map()
  );
  const [currentStateDef, setCurrentStateDef] = useState<{
    id: string;
    def: StateDefinition;
  } | null>(null);
  const [manualTransitions, setManualTransitions] = useState<
    Array<{ to: string; label: string }>
  >([]);

  const engineRef = useRef<ProfileEngine | null>(null);

  // ── Logging ────────────────────────────────────────────────────────────

  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setLogs((prev) => [
      { id: String(logIdRef.current++), timestamp, type, message },
      ...prev.slice(0, 199),
    ]);
  }, []);

  const clearLogs = () => setLogs([]);

  // ── Engine Setup ───────────────────────────────────────────────────────

  useEffect(() => {
    const engine = new ProfileEngine({
      onLog: (msg, type) => {
        const logType = (type as LogEntry['type']) || 'info';
        addLog(logType, msg);
      },
      onValueChange: (_svcUUID, charUUID, value) => {
        setCharValues((prev) => {
          const next = new Map(prev);
          next.set(charUUID.toUpperCase(), value);
          return next;
        });
      },
      onWriteStateChange: (key, value) => {
        setWriteStateMap((prev) => {
          const next = new Map(prev);
          next.set(key, value);
          return next;
        });
      },
      onStateChange: (stateId, stateDef) => {
        setCurrentStateDef({ id: stateId, def: stateDef });
        if (engineRef.current) {
          setManualTransitions(engineRef.current.getManualTransitions());
        }
      },
      onAdvertisingChange: (advertising) => {
        setIsAdvertising(advertising);
      },
    });
    engineRef.current = engine;

    return () => {
      engine.stopProfile();
    };
  }, [addLog]);

  useEffect(() => {
    const sub = onDidUpdateState((event: EventDidUpdateState) => {
      setCurrentManagerState(event.state);
      if (!event.stateDescription.startsWith('[native')) {
        addLog('event', `State: ${event.stateDescription}`);
      }
    });
    return () => sub.remove();
  }, [addLog]);

  // ── Android Permissions ────────────────────────────────────────────────

  const requestPermissions = useCallback(async () => {
    if (Platform.OS !== 'android') {
      return true;
    }
    try {
      if (Platform.Version >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);
        return (
          granted['android.permission.BLUETOOTH_ADVERTISE'] ===
            PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.BLUETOOTH_CONNECT'] ===
            PermissionsAndroid.RESULTS.GRANTED
        );
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  // ── Profile Actions ────────────────────────────────────────────────────

  const selectProfile = useCallback((profile: BleProfile) => {
    setSelectedProfile(profile);
    addLog('info', `Selected profile: ${profile.name}`);
  }, [addLog]);

  const handleStartPeripheral = useCallback(async () => {
    const engine = engineRef.current;
    const profile = selectedProfile;
    if (!engine || !profile) {
      addLog('error', 'Select a profile first');
      return;
    }

    if (Platform.OS === 'android') {
      const granted = await requestPermissions();
      if (!granted) {
        addLog('error', 'BLE permissions denied');
        return;
      }
    }

    try {
      if (engine.isRunning()) {
        engine.stopProfile();
      }
      engine.loadProfile(profile);
      await engine.executeProfile();
      setActiveProfile(profile);

      const initialValues = new Map<string, number | number[] | string>();
      for (const svc of profile.services) {
        for (const char of svc.characteristics) {
          if (char.value?.initial !== undefined) {
            initialValues.set(
              char.uuid.toUpperCase(),
              char.value.initial as number | number[] | string
            );
          }
        }
      }
      setCharValues(initialValues);

      if (engine.getCurrentState() && profile.stateMachine) {
        const stateId = engine.getCurrentState()!;
        const stateDef = profile.stateMachine.states[stateId];
        if (stateDef) {
          setCurrentStateDef({ id: stateId, def: stateDef });
        }
        setManualTransitions(engine.getManualTransitions());
      }
    } catch (error) {
      addLog('error', `Failed to start peripheral: ${error}`);
    }
  }, [addLog, requestPermissions, selectedProfile]);

  const handleStopProfile = useCallback(() => {
    engineRef.current?.stopProfile();
    setActiveProfile(null);
    setCharValues(new Map());
    setWriteStateMap(new Map());
    setCurrentStateDef(null);
    setManualTransitions([]);
  }, []);

  const handleManualTransition = useCallback((targetStateId: string) => {
    engineRef.current?.triggerManualTransition(targetStateId);
  }, []);

  const handleValueChange = useCallback(
    (serviceUUID: string, charUUID: string, value: number) => {
      engineRef.current?.updateCharacteristicValue(serviceUUID, charUUID, value);
    },
    []
  );

  // ── Render Helpers ─────────────────────────────────────────────────────

  const renderCharacteristicControl = (
    char: ProfileCharacteristic,
    serviceUUID: string
  ) => {
    if (!char.ui) {
      return null;
    }

    const currentValue = charValues.get(char.uuid.toUpperCase());
    const numericValue =
      typeof currentValue === 'number'
        ? currentValue
        : Array.isArray(currentValue) && currentValue.length > 1
          ? currentValue[currentValue.length - 1] ?? 0
          : 0;

    return (
      <View key={char.uuid} style={styles.charControl}>
        {renderControl(char.ui, numericValue, serviceUUID, char.uuid)}
      </View>
    );
  };

  const renderControl = (
    ui: UiHint,
    value: number,
    serviceUUID: string,
    charUUID: string
  ) => {
    switch (ui.control) {
      case 'stepper':
        return renderStepper(ui, value, serviceUUID, charUUID);
      case 'slider':
        return renderSlider(ui, value, serviceUUID, charUUID);
      case 'toggle':
        return renderToggle(ui, value, serviceUUID, charUUID);
      case 'readonly':
        return renderReadonly(ui, value);
      default:
        return null;
    }
  };

  const renderStepper = (
    ui: UiHint,
    value: number,
    serviceUUID: string,
    charUUID: string
  ) => {
    const step = ui.step || 1;
    const min = ui.min ?? 0;
    const max = ui.max ?? 255;

    return (
      <View>
        <Text style={styles.controlLabel}>
          {ui.label}
          {ui.unit ? ` (${ui.unit})` : ''}
        </Text>
        <View style={styles.stepperRow}>
          <TouchableOpacity
            style={styles.stepperButton}
            onPress={() =>
              handleValueChange(
                serviceUUID,
                charUUID,
                Math.max(min, value - step * 5)
              )
            }
            activeOpacity={0.7}
          >
            <Text style={styles.stepperButtonText}>-{step * 5}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.stepperButton}
            onPress={() =>
              handleValueChange(serviceUUID, charUUID, Math.max(min, value - step))
            }
            activeOpacity={0.7}
          >
            <Text style={styles.stepperButtonText}>-{step}</Text>
          </TouchableOpacity>
          <View style={styles.stepperValueContainer}>
            <Text style={styles.stepperValue}>{value}</Text>
            {ui.unit && <Text style={styles.stepperUnit}>{ui.unit}</Text>}
          </View>
          <TouchableOpacity
            style={styles.stepperButton}
            onPress={() =>
              handleValueChange(serviceUUID, charUUID, Math.min(max, value + step))
            }
            activeOpacity={0.7}
          >
            <Text style={styles.stepperButtonText}>+{step}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.stepperButton}
            onPress={() =>
              handleValueChange(
                serviceUUID,
                charUUID,
                Math.min(max, value + step * 5)
              )
            }
            activeOpacity={0.7}
          >
            <Text style={styles.stepperButtonText}>+{step * 5}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderSlider = (
    ui: UiHint,
    value: number,
    serviceUUID: string,
    charUUID: string
  ) => {
    const step = ui.step || 10;
    const min = ui.min ?? 0;
    const max = ui.max ?? 100;
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;

    return (
      <View>
        <Text style={styles.controlLabel}>
          {ui.label}
          {ui.unit ? ` (${ui.unit})` : ''}
        </Text>
        <View style={styles.sliderRow}>
          <TouchableOpacity
            style={styles.sliderButton}
            onPress={() =>
              handleValueChange(serviceUUID, charUUID, min)
            }
            activeOpacity={0.7}
          >
            <Text style={styles.sliderButtonText}>{min}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sliderButton}
            onPress={() =>
              handleValueChange(serviceUUID, charUUID, Math.max(min, value - step))
            }
            activeOpacity={0.7}
          >
            <Text style={styles.sliderButtonText}>-{step}</Text>
          </TouchableOpacity>
          <View style={styles.sliderValueContainer}>
            <View style={styles.sliderBarBg}>
              <View style={[styles.sliderBarFill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.sliderValue}>
              {value}
              {ui.unit || ''}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.sliderButton}
            onPress={() =>
              handleValueChange(serviceUUID, charUUID, Math.min(max, value + step))
            }
            activeOpacity={0.7}
          >
            <Text style={styles.sliderButtonText}>+{step}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sliderButton}
            onPress={() =>
              handleValueChange(serviceUUID, charUUID, max)
            }
            activeOpacity={0.7}
          >
            <Text style={styles.sliderButtonText}>{max}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderToggle = (
    ui: UiHint,
    value: number,
    serviceUUID: string,
    charUUID: string
  ) => {
    const isOn = value !== 0;
    return (
      <View>
        <Text style={styles.controlLabel}>{ui.label}</Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>{isOn ? 'ON' : 'OFF'}</Text>
          <Switch
            value={isOn}
            onValueChange={(newVal) =>
              handleValueChange(serviceUUID, charUUID, newVal ? 1 : 0)
            }
            trackColor={{ false: '#2d323c', true: '#2d4a38' }}
            thumbColor={isOn ? '#6b9b7a' : '#4b5563'}
          />
        </View>
      </View>
    );
  };

  const renderReadonly = (ui: UiHint, value: number) => {
    const writeKey = activeProfile?.services
      .flatMap((s) => s.characteristics)
      .find((c) => c.ui === ui)?.onWrite?.stateKey;

    const displayValue = writeKey
      ? writeStateMap.get(writeKey)
      : value;

    return (
      <View>
        <Text style={styles.controlLabel}>{ui.label}</Text>
        <Text style={styles.readonlyValue}>
          {displayValue !== undefined ? String(displayValue) : '--'}
        </Text>
      </View>
    );
  };

  // ── Main Render ────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={appStyles.container}>
      {/* Header */}
      <View style={appStyles.header}>
        <View style={styles.headerRow}>
          <Text style={appStyles.title}>BLE Peripheral Emulator</Text>
        </View>
        <View style={appStyles.statusRow}>
          <Text style={appStyles.statusLabel}>
            ManagerState: {getStateDescription(currentManagerState)}
          </Text>
          <View
            style={[
              appStyles.statusDot,
              isAdvertising
                ? appStyles.statusDotAdvertising
                : currentManagerState === ManagerState.PoweredOn
                  ? appStyles.statusDotPoweredOn
                  : appStyles.statusDotError,
            ]}
          />
        </View>
      </View>

      <ScrollView
        style={appStyles.controlsContainer}
        contentContainerStyle={appStyles.controlsContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile picker + start (when not advertising a profile) */}
        {!activeProfile && (
          <>
            <Text style={appStyles.sectionTitle}>Select profile</Text>
            {BUNDLED_PROFILES.map((profile) => {
              const selected = selectedProfile?.id === profile.id;
              return (
                <TouchableOpacity
                  key={profile.id}
                  style={[
                    styles.profileCard,
                    selected && styles.profileCardSelected,
                  ]}
                  onPress={() => selectProfile(profile)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.profileName}>{profile.name}</Text>
                  {profile.description && (
                    <Text style={styles.profileDesc}>{profile.description}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[
                styles.startButton,
                !selectedProfile && styles.startButtonDisabled,
              ]}
              onPress={handleStartPeripheral}
              disabled={!selectedProfile}
              activeOpacity={0.7}
            >
              <Text style={styles.startButtonText}>Start peripheral</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Active Profile Controls */}
        {activeProfile && (
          <>
            {/* Profile Header + Stop */}
            <View style={styles.activeProfileHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.activeProfileName}>
                  {activeProfile.name}
                </Text>
                {activeProfile.description && (
                  <Text style={styles.activeProfileDesc}>
                    {activeProfile.description}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.stopButton}
                onPress={handleStopProfile}
                activeOpacity={0.7}
              >
                <Text style={styles.stopButtonText}>Stop</Text>
              </TouchableOpacity>
            </View>

            {/* State Machine Indicator */}
            {currentStateDef && (
              <View style={styles.stateContainer}>
                <View style={styles.stateBadge}>
                  <Text style={styles.stateBadgeText}>
                    {currentStateDef.def.name}
                  </Text>
                </View>
                {currentStateDef.def.description && (
                  <Text style={styles.stateDesc}>
                    {currentStateDef.def.description}
                  </Text>
                )}

                {/* Manual Transition Buttons */}
                {manualTransitions.length > 0 && (
                  <View style={styles.transitionRow}>
                    {manualTransitions.map((t) => (
                      <TouchableOpacity
                        key={t.to}
                        style={styles.transitionButton}
                        onPress={() => handleManualTransition(t.to)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.transitionButtonText}>
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Dynamic Characteristic Controls */}
            {activeProfile.services.map((svc) => {
              const controlChars = svc.characteristics.filter((c) => c.ui);
              if (controlChars.length === 0) {
                return null;
              }
              return (
                <View key={svc.uuid} style={styles.serviceSection}>
                  <Text style={appStyles.sectionTitle}>
                    {svc.name || svc.uuid}
                  </Text>
                  {controlChars.map((char) =>
                    renderCharacteristicControl(char, svc.uuid)
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <DebugLogPanel logs={logs} onClear={clearLogs} />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  profileCard: {
    backgroundColor: '#1a1d24',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2d323c',
  },
  profileCardSelected: {
    borderColor: '#4a7ab0',
    backgroundColor: '#1a2228',
  },
  startButton: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#1e3d2a',
    borderWidth: 1,
    borderColor: '#3d6b4f',
    alignItems: 'center',
  },
  startButtonDisabled: {
    opacity: 0.45,
  },
  startButtonText: {
    color: '#c8e6d0',
    fontSize: 16,
    fontWeight: '600',
  },
  profileName: {
    color: '#e4e7ec',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  profileDesc: {
    color: '#8b949e',
    fontSize: 13,
  },
  activeProfileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  activeProfileName: {
    color: '#e4e7ec',
    fontSize: 17,
    fontWeight: '600',
  },
  activeProfileDesc: {
    color: '#8b949e',
    fontSize: 12,
    marginTop: 2,
  },
  stopButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#221a1c',
    borderWidth: 1,
    borderColor: '#5a4548',
    marginLeft: 12,
  },
  stopButtonText: {
    color: '#c4a8a8',
    fontSize: 14,
    fontWeight: '500',
  },
  stateContainer: {
    backgroundColor: '#16181f',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2d323c',
  },
  stateBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#1a2430',
    borderWidth: 1,
    borderColor: '#3d5a6e',
    marginBottom: 6,
  },
  stateBadgeText: {
    color: '#b8d4e8',
    fontSize: 13,
    fontWeight: '600',
  },
  stateDesc: {
    color: '#8b949e',
    fontSize: 12,
    marginBottom: 8,
  },
  transitionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  transitionButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#1e2129',
    borderWidth: 1,
    borderColor: '#353b4a',
  },
  transitionButtonText: {
    color: '#d1d5db',
    fontSize: 13,
    fontWeight: '500',
  },
  serviceSection: {
    backgroundColor: '#16181f',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2d323c',
  },
  charControl: {
    marginBottom: 12,
  },
  controlLabel: {
    color: '#a8b0bd',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#1a1d24',
    borderWidth: 1,
    borderColor: '#353b4a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: {
    color: '#d1d5db',
    fontSize: 13,
    fontWeight: '600',
  },
  stepperValueContainer: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  stepperValue: {
    fontSize: 38,
    fontWeight: '600',
    color: '#e4e7ec',
    fontVariant: ['tabular-nums'],
  },
  stepperUnit: {
    fontSize: 12,
    fontWeight: '500',
    color: '#9ca3af',
    marginTop: -2,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  sliderButton: {
    width: 40,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#1a1d24',
    borderWidth: 1,
    borderColor: '#3d4a5c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderButtonText: {
    color: '#d1d5db',
    fontSize: 12,
    fontWeight: '600',
  },
  sliderValueContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  sliderBarBg: {
    width: '100%',
    height: 20,
    backgroundColor: '#1a1d24',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2d323c',
    overflow: 'hidden',
  },
  sliderBarFill: {
    height: '100%',
    backgroundColor: '#5a7a6a',
    borderRadius: 5,
  },
  sliderValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#a8b5a8',
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    color: '#d1d5db',
    fontSize: 14,
    fontWeight: '500',
  },
  readonlyValue: {
    color: '#9ca3af',
    fontSize: 16,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
});
