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
  Image,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Platform,
  PermissionsAndroid,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import {
  ManagerState,
  onDidUpdateState,
  getStateDescription,
  type EventDidUpdateState,
  registerBroadcastReceiver,
  unregisterBroadcastReceiver,
  onDidReceiveBroadcastIntent,
  type EventDidReceiveBroadcastIntent,
} from 'rn-ble-peripheral-module';

import { ProfileEngine } from './profiles/profileEngine';
import { BUNDLED_PROFILES, getProfileById } from './profiles/profileRegistry';
import {
  fetchRemoteProfileCatalog,
  fetchRemoteLatestBleProfile,
  type RemoteCatalogRow,
} from './profiles/remoteProfileClient';
import { REMOTE_PROFILE_API_BASE } from './config/remoteProfileApiBase';
import type {
  BleProfile,
  ProfileCharacteristic,
  StateDefinition,
  UiHint,
} from './profiles/types';
import type { LogEntry } from './types/log';
import { appStyles } from './styles/appStyles';
import { DebugLogPanel } from './components/DebugLogPanel';
import {
  BATTERY_LEVEL_CHAR_UUID,
  BATTERY_SERVICE_UUID,
  EXAMPLE_BROADCAST_ACTION,
  LBS_BUTTON_CHAR_UUID,
  LBS_LED_CHAR_UUID,
  LBS_SERVICE_UUID,
} from './constants/bleUuids';

/** Unicode U+1F50B — battery icon before Battery label (matches central app). */
const BATTERY_EMOJI = '\u{1F50B}';
/** Unicode U+1F4A1 — bulb after LED OFF/ON pills (dims when LED off). */
const BULB_EMOJI = '\u{1F4A1}';

/** Default local profile for first paint and when returning from Remote source. */
const DEFAULT_LOCAL_PROFILE =
  BUNDLED_PROFILES.find((p) => p.id === 'nordic-lbs') ?? null;

function normUuid(u: string): string {
  return u.replace(/-/g, '').toLowerCase();
}

/** 16-bit characteristic/service id (e.g. `2a19`) — works for short or 128-bit UUIDs. */
function uuidShort16(u: string): string {
  const n = normUuid(u);
  if (n.length <= 4) {
    return n.padStart(4, '0');
  }
  return n.substring(4, 8);
}

function isLedCharacteristic(char: ProfileCharacteristic): boolean {
  return normUuid(char.uuid) === normUuid(LBS_LED_CHAR_UUID);
}

function ledLitFromDisplay(
  displayValue: unknown,
  fallbackNumeric: number
): boolean {
  if (typeof displayValue === 'boolean') {
    return displayValue;
  }
  if (typeof displayValue === 'number') {
    return displayValue !== 0;
  }
  if (typeof displayValue === 'string') {
    const s = displayValue.toLowerCase();
    if (s === 'false' || s === '0') {
      return false;
    }
    if (s === 'true' || s === '1') {
      return true;
    }
  }
  return fallbackNumeric !== 0;
}

export default function ProfileApp() {
  const { height: windowHeight } = useWindowDimensions();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const logIdRef = useRef(0);

  const [currentManagerState, setCurrentManagerState] = useState<number>(
    ManagerState.Unknown
  );
  const [isAdvertising, setIsAdvertising] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<BleProfile | null>(
    () => DEFAULT_LOCAL_PROFILE
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

  const [profileSource, setProfileSource] = useState<'local' | 'remote'>('local');
  const [remoteRows, setRemoteRows] = useState<RemoteCatalogRow[]>([]);
  const [remoteListLoading, setRemoteListLoading] = useState(false);
  const [remoteProfileLoadingId, setRemoteProfileLoadingId] = useState<string | null>(
    null
  );

  const engineRef = useRef<ProfileEngine | null>(null);
  const selectedProfileRef = useRef(selectedProfile);
  useEffect(() => {
    selectedProfileRef.current = selectedProfile;
  }, [selectedProfile]);

  const charValuesRef = useRef(charValues);
  useEffect(() => {
    charValuesRef.current = charValues;
  }, [charValues]);

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

  const handleFetchRemoteCatalog = useCallback(async () => {
    setRemoteListLoading(true);
    try {
      const rows = await fetchRemoteProfileCatalog();
      setRemoteRows(rows);
      addLog('info', `Remote catalog: ${rows.length} profile(s) from server`);
    } catch (e) {
      addLog('error', `Remote list failed: ${e}`);
    } finally {
      setRemoteListLoading(false);
    }
  }, [addLog]);

  const handleSelectRemoteProfile = useCallback(
    async (profileId: string) => {
      setRemoteProfileLoadingId(profileId);
      try {
        const profile = await fetchRemoteLatestBleProfile(profileId);
        setSelectedProfile(profile);
        addLog(
          'info',
          `Loaded remote latest: ${profile.name} (${profileId})`
        );
      } catch (e) {
        addLog('error', `Remote profile failed: ${e}`);
      } finally {
        setRemoteProfileLoadingId(null);
      }
    },
    [addLog]
  );

  const startPeripheralWithProfile = useCallback(
    async (profile: BleProfile) => {
      const engine = engineRef.current;
      if (!engine) {
        addLog('error', 'Peripheral engine not ready');
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
    },
    [addLog, requestPermissions]
  );

  const handleStartPeripheral = useCallback(async () => {
    const profile = selectedProfile;
    if (!profile) {
      addLog('error', 'Select a profile first');
      return;
    }
    await startPeripheralWithProfile(profile);
  }, [addLog, selectedProfile, startPeripheralWithProfile]);

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

  // ── Android ADB broadcast automation (see automation/scripts/v2/) ───────

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    registerBroadcastReceiver([EXAMPLE_BROADCAST_ACTION]);

    const sub = onDidReceiveBroadcastIntent(
      (event: EventDidReceiveBroadcastIntent & { extras?: Record<string, unknown> }) => {
      const extras = event.extras;
      if (!extras) {
        return;
      }
      const rawCmd = extras.command;
      if (typeof rawCmd !== 'string') {
        return;
      }
      const cmd = rawCmd.trim();

      if (cmd === 'TRG_SELECT_LOCAL') {
        setProfileSource('local');
        addLog('info', '[automation] profile source: Local');
        return;
      }

      if (cmd === 'TRG_SELECT_PROFILE') {
        const pid = extras.profileId;
        if (typeof pid !== 'string' || !pid.trim()) {
          addLog('error', '[automation] TRG_SELECT_PROFILE: missing profileId');
          return;
        }
        const p = getProfileById(pid.trim());
        if (!p) {
          addLog('error', `[automation] Unknown profileId: ${pid}`);
          return;
        }
        setSelectedProfile(p);
        addLog('info', `[automation] selected profile: ${p.name}`);
        return;
      }

      if (cmd === 'TRG_START_PERIPHERAL') {
        const pid = extras.profileId;
        let profile: BleProfile | undefined;
        if (typeof pid === 'string' && pid.trim()) {
          profile = getProfileById(pid.trim());
          if (!profile) {
            addLog('error', `[automation] Unknown profileId: ${pid}`);
            return;
          }
        } else {
          profile = selectedProfileRef.current ?? undefined;
        }
        if (!profile) {
          addLog('error', '[automation] No profile (set TRG_SELECT_PROFILE or pass profileId)');
          return;
        }
        void startPeripheralWithProfile(profile);
        addLog('info', '[automation] START_PERIPHERAL');
        return;
      }

      if (cmd === 'TRG_BUTTON_ON') {
        handleValueChange(LBS_SERVICE_UUID, LBS_BUTTON_CHAR_UUID, 1);
        addLog('info', '[automation] Button ON');
        return;
      }

      if (cmd === 'TRG_BUTTON_OFF') {
        handleValueChange(LBS_SERVICE_UUID, LBS_BUTTON_CHAR_UUID, 0);
        addLog('info', '[automation] Button OFF');
        return;
      }

      if (cmd === 'TRG_SHOW_LOGS') {
        setShowLogs(true);
        addLog('info', '[automation] Logs panel shown');
        return;
      }

      if (cmd === 'TRG_BATTERY_PLUS_10' || cmd === 'TRG_BATTERY_MINUS_10') {
        const profile = selectedProfileRef.current;
        if (!profile) {
          addLog('error', '[automation] No active profile for battery update');
          return;
        }
        let svcUUID: string | undefined;
        let charUUID: string | undefined;
        for (const svc of profile.services) {
          if (uuidShort16(svc.uuid) !== uuidShort16(BATTERY_SERVICE_UUID)) { continue; }
          for (const ch of svc.characteristics) {
            if (uuidShort16(ch.uuid) === uuidShort16(BATTERY_LEVEL_CHAR_UUID)) {
              svcUUID = svc.uuid;
              charUUID = ch.uuid;
              break;
            }
          }
          if (charUUID) { break; }
        }
        if (!svcUUID || !charUUID) {
          addLog('error', '[automation] Battery characteristic not found in active profile');
          return;
        }
        const cur = (charValuesRef.current.get(charUUID.toUpperCase()) as number) ?? 50;
        const delta = cmd === 'TRG_BATTERY_PLUS_10' ? 10 : -10;
        const next = Math.max(0, Math.min(100, cur + delta));
        handleValueChange(svcUUID, charUUID, next);
        addLog('info', `[automation] Battery ${cur} → ${next}`);
        return;
      }
    }
    );

    return () => {
      sub.remove();
      unregisterBroadcastReceiver();
    };
  }, [addLog, handleValueChange, startPeripheralWithProfile]);

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

    const charTestBase = `peripheral-char-${normUuid(char.uuid)}`;
    return (
      <View key={char.uuid} style={styles.charControl} testID={charTestBase}>
        {renderControl(
          char.ui,
          numericValue,
          serviceUUID,
          char.uuid,
          char,
          charTestBase
        )}
      </View>
    );
  };

  const renderControl = (
    ui: UiHint,
    value: number,
    serviceUUID: string,
    charUUID: string,
    char: ProfileCharacteristic,
    charTestBase: string
  ) => {
    switch (ui.control) {
      case 'stepper':
        return renderStepper(ui, value, serviceUUID, charUUID, charTestBase);
      case 'slider':
        return renderSlider(ui, value, serviceUUID, charUUID, charTestBase);
      case 'toggle':
        return renderToggle(ui, value, serviceUUID, charUUID, charTestBase);
      case 'readonly':
        return renderReadonly(ui, value, char);
      default:
        return null;
    }
  };

  const renderStepper = (
    ui: UiHint,
    value: number,
    serviceUUID: string,
    charUUID: string,
    charTestBase: string
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
            testID={`${charTestBase}-stepper-plus-one`}
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
    charUUID: string,
    charTestBase: string
  ) => {
    const step = ui.step || 10;
    const min = ui.min ?? 0;
    const max = ui.max ?? 100;
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    const isBatteryLevelChar = uuidShort16(charUUID) === '2a19';

    if (isBatteryLevelChar) {
      const unit = ui.unit || '%';
      return (
        <View style={styles.batterySection}>
          <View style={styles.batteryMetricRow}>
            <Text style={styles.batteryMetricIcon}>{BATTERY_EMOJI}</Text>
            <Text
              style={styles.batteryMetricText}
              accessible={false}
              testID={`${charTestBase}-battery-line`}
            >
              Battery: {value}
              {unit}
            </Text>
          </View>
          <View style={styles.batteryControlsRow}>
            <TouchableOpacity
              style={styles.batteryMiniBtn}
              onPress={() => handleValueChange(serviceUUID, charUUID, min)}
              activeOpacity={0.7}
            >
              <Text style={styles.batteryMiniBtnText}>{min}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.batteryMiniBtn}
              onPress={() =>
                handleValueChange(
                  serviceUUID,
                  charUUID,
                  Math.max(min, value - step)
                )
              }
              activeOpacity={0.7}
            >
              <Text style={styles.batteryMiniBtnText}>-{step}</Text>
            </TouchableOpacity>
            <View style={styles.batteryBarWrap}>
              <View style={styles.batteryBarTrack}>
                <View style={[styles.batteryBarFill, { width: `${pct}%` }]} />
              </View>
            </View>
            <TouchableOpacity
              accessible
              accessibilityLabel="Peripheral battery plus ten"
              testID={`${charTestBase}-slider-plus-step`}
              style={styles.batteryMiniBtn}
              onPress={() =>
                handleValueChange(serviceUUID, charUUID, Math.min(max, value + step))
              }
              activeOpacity={0.7}
            >
              <Text style={styles.batteryMiniBtnText} accessible={false}>
                +{step}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID={`${charTestBase}-slider-max`}
              style={styles.batteryMiniBtn}
              onPress={() => handleValueChange(serviceUUID, charUUID, max)}
              activeOpacity={0.7}
            >
              <Text style={styles.batteryMiniBtnText}>{max}</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View>
        <Text style={styles.controlLabel} accessible={false}>
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
            testID={`${charTestBase}-slider-plus-step`}
            style={styles.sliderButton}
            onPress={() =>
              handleValueChange(serviceUUID, charUUID, Math.min(max, value + step))
            }
            activeOpacity={0.7}
          >
            <Text style={styles.sliderButtonText}>+{step}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID={`${charTestBase}-slider-max`}
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
    charUUID: string,
    charTestBase: string
  ) => {
    const isOn = value !== 0;
    const setVal = (on: boolean) =>
      handleValueChange(serviceUUID, charUUID, on ? 1 : 0);
    return (
      <View
        testID={`${charTestBase}-switch`}
        accessibilityLabel="Peripheral LBS button switch"
      >
        <View style={styles.statePillRow}>
          <Text style={styles.statePillLabel} accessible={false}>
            {ui.label} state:
          </Text>
          <View style={styles.statePillGroup}>
            <TouchableOpacity
              accessibilityLabel="Peripheral button ON"
              accessibilityRole="button"
              accessibilityState={{ selected: isOn }}
              style={[
                styles.statePillBtn,
                isOn && styles.statePillBtnSelected,
              ]}
              onPress={() => setVal(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.statePillOnText}>ON</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Peripheral button OFF"
              accessibilityRole="button"
              accessibilityState={{ selected: !isOn }}
              style={[
                styles.statePillBtn,
                !isOn && styles.statePillBtnSelected,
              ]}
              onPress={() => setVal(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.statePillOffText}>OFF</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderReadonly = (ui: UiHint, value: number, char: ProfileCharacteristic) => {
    const writeKey = char.onWrite?.stateKey;
    const displayValue = writeKey
      ? writeStateMap.get(writeKey)
      : value;

    if (isLedCharacteristic(char)) {
      const lit = ledLitFromDisplay(displayValue, value);
      return (
        <View
          accessibilityLabel={lit ? 'Peripheral LED on' : 'Peripheral LED off'}
        >
          <View style={styles.ledControlRow}>
            <Text style={styles.ledSectionLabel}>{ui.label}:</Text>
            <Text
              style={[styles.ledBulbEmoji, lit ? styles.ledBulbOn : styles.ledBulbOff]}
              accessibilityLabel={lit ? 'LED on' : 'LED off'}
            >
              {BULB_EMOJI}
            </Text>
            <Text style={styles.ledStateText} accessible={false}>
              {lit ? 'ON' : 'OFF'}
            </Text>
          </View>
        </View>
      );
    }

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
      <View
        style={[
          styles.mainArea,
          showLogs && { paddingBottom: windowHeight * 0.3 },
        ]}
      >
        {/* Header */}
        <View style={appStyles.header}>
          <View style={styles.headerRow}>
            <View style={styles.headerTitleRow}>
              <Image
                source={require('./assets/app-icon.png')}
                style={styles.headerIcon}
                accessibilityLabel="App icon"
                accessibilityRole="image"
              />
              <Text style={[appStyles.title, styles.headerTitleText]}>
                BLE Peripheral Emulator
              </Text>
            </View>
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
          style={[appStyles.controlsContainer, styles.scrollArea]}
          contentContainerStyle={[appStyles.controlsContent, styles.scrollContent]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
          nestedScrollEnabled
          bounces
        >
        {/* Profile picker + start (when not advertising a profile) */}
        {!activeProfile && (
          <>
            <Text style={appStyles.sectionTitle}>Profile source</Text>
            <View style={styles.sourceRow}>
              <TouchableOpacity
                testID="peripheral-source-local"
                style={[
                  styles.sourceChip,
                  profileSource === 'local' && styles.sourceChipSelected,
                ]}
                onPress={() => {
                  setProfileSource('local');
                  setSelectedProfile(DEFAULT_LOCAL_PROFILE);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.sourceChipText,
                    profileSource === 'local' && styles.sourceChipTextSelected,
                  ]}
                >
                  Local
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="peripheral-source-remote"
                style={[
                  styles.sourceChip,
                  profileSource === 'remote' && styles.sourceChipSelected,
                ]}
                onPress={() => {
                  setProfileSource('remote');
                  setSelectedProfile(null);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.sourceChipText,
                    profileSource === 'remote' && styles.sourceChipTextSelected,
                  ]}
                >
                  Remote
                </Text>
              </TouchableOpacity>
            </View>
            {profileSource === 'remote' && (
              <>
                <Text style={styles.remoteBaseHint}>{REMOTE_PROFILE_API_BASE}</Text>
                <Text style={styles.remoteBaseHint}>
                  Physical device: set REMOTE_PROFILE_LAN_HOST in peripheral-app/.env (see .env.example),
                  then restart Metro with cache reset if needed.
                </Text>
              </>
            )}

            <Text style={appStyles.sectionTitle}>Select profile</Text>
            {profileSource === 'local' &&
              BUNDLED_PROFILES.map((profile) => {
                const selected = selectedProfile?.id === profile.id;
                return (
                  <TouchableOpacity
                    key={profile.id}
                    accessible
                    testID={`peripheral-profile-${profile.id}`}
                    accessibilityLabel={`Peripheral profile ${profile.name}`}
                    style={[
                      styles.profileCard,
                      selected && styles.profileCardSelected,
                    ]}
                    onPress={() => selectProfile(profile)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.profileName} accessible={false}>
                      {profile.name}
                    </Text>
                    {profile.description && (
                      <Text style={styles.profileDesc} accessible={false}>
                        {profile.description}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}

            {profileSource === 'remote' && (
              <>
                <TouchableOpacity
                  style={[
                    styles.fetchRemoteButton,
                    remoteListLoading && styles.startButtonDisabled,
                  ]}
                  onPress={handleFetchRemoteCatalog}
                  disabled={remoteListLoading}
                  activeOpacity={0.7}
                >
                  <Text style={styles.fetchRemoteButtonText}>
                    {remoteListLoading ? 'Fetching…' : 'Fetch remote profiles'}
                  </Text>
                </TouchableOpacity>
                {remoteRows.length === 0 && !remoteListLoading && (
                  <Text style={styles.profileDesc}>
                    Tap fetch to load the catalog from the remote-profile server.
                  </Text>
                )}
                {remoteRows.map((row) => {
                  const selected = selectedProfile?.id === row.profileId;
                  const loadingThis = remoteProfileLoadingId === row.profileId;
                  return (
                    <TouchableOpacity
                      key={row.profileId}
                      style={[
                        styles.profileCard,
                        selected && styles.profileCardSelected,
                        loadingThis && styles.profileCardLoading,
                      ]}
                      onPress={() => handleSelectRemoteProfile(row.profileId)}
                      disabled={loadingThis}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.profileName}>{row.name}</Text>
                      <Text style={styles.profileDesc}>
                        {row.profileId} · latest v{row.latestPublishedVersion} (
                        {row.category})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
            <TouchableOpacity
              accessible
              testID="peripheral-start"
              accessibilityLabel="Start peripheral"
              style={[
                styles.startButton,
                !selectedProfile && styles.startButtonDisabled,
              ]}
              onPress={handleStartPeripheral}
              disabled={!selectedProfile}
              activeOpacity={0.7}
            >
              <Text style={styles.startButtonText} accessible={false}>
                Start peripheral
              </Text>
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
          </>
        )}
        </ScrollView>
      </View>

      {showLogs && (
        <View style={styles.logPanel}>
          <View style={styles.logPanelInner}>
            <DebugLogPanel logs={logs} onClear={clearLogs} />
          </View>
        </View>
      )}

      <TouchableOpacity
        testID="peripheral-toggle-logs"
        accessibilityLabel={showLogs ? 'Hide peripheral logs' : 'Show peripheral logs'}
        style={styles.logFab}
        onPress={() => setShowLogs((prev) => !prev)}
      >
        <Text style={styles.logFabText}>{showLogs ? 'Logs–' : 'Logs+'}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  mainArea: {
    flex: 1,
    minHeight: 0,
  },
  /** Fills space below fixed header so inner profile controls scroll. */
  scrollArea: {
    flex: 1,
    minHeight: 0,
    flexShrink: 1,
  },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 40,
  },
  logPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '70%',
    bottom: 0,
    backgroundColor: '#0c0614',
    borderTopWidth: 1,
    borderTopColor: '#4a3d62',
    zIndex: 10,
  },
  logPanelInner: {
    flex: 1,
  },
  logFab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#4c2889',
    borderWidth: 1,
    borderColor: '#7c3aed',
    zIndex: 11,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  logFabText: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '600',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  headerIcon: {
    width: 28,
    height: 28,
    marginRight: 10,
    resizeMode: 'contain',
    borderRadius: 8,
    overflow: 'hidden',
  },
  headerTitleText: {
    flexShrink: 1,
  },
  sourceRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 6,
  },
  sourceChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#1e1528',
    borderWidth: 1,
    borderColor: '#352848',
  },
  sourceChipSelected: {
    borderColor: '#8b7cbd',
    backgroundColor: '#241a30',
  },
  sourceChipText: {
    color: '#8b949e',
    fontSize: 14,
    fontWeight: '600',
  },
  sourceChipTextSelected: {
    color: '#c8d4e8',
  },
  remoteBaseHint: {
    color: '#5c6570',
    fontSize: 11,
    marginBottom: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  fetchRemoteButton: {
    marginBottom: 10,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#221a34',
    borderWidth: 1,
    borderColor: '#4a3d62',
    alignItems: 'center',
  },
  fetchRemoteButtonText: {
    color: '#b8d4e8',
    fontSize: 15,
    fontWeight: '600',
  },
  profileCardLoading: {
    opacity: 0.55,
  },
  profileCard: {
    backgroundColor: '#1e1528',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#352848',
  },
  profileCardSelected: {
    borderColor: '#8b7cbd',
    backgroundColor: '#241a30',
  },
  startButton: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#2d1f42',
    borderWidth: 1,
    borderColor: '#5a4480',
    alignItems: 'center',
  },
  startButtonDisabled: {
    opacity: 0.45,
  },
  startButtonText: {
    color: '#e9d5ff',
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
    backgroundColor: '#2a1a2c',
    borderWidth: 1,
    borderColor: '#5a3d50',
    marginLeft: 12,
  },
  stopButtonText: {
    color: '#c4a8a8',
    fontSize: 14,
    fontWeight: '500',
  },
  stateContainer: {
    backgroundColor: '#1a1224',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#352848',
  },
  stateBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#221a34',
    borderWidth: 1,
    borderColor: '#4a3d62',
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
    backgroundColor: '#1e182c',
    borderWidth: 1,
    borderColor: '#3a3550',
  },
  transitionButtonText: {
    color: '#d1d5db',
    fontSize: 13,
    fontWeight: '500',
  },
  serviceSection: {
    backgroundColor: '#1a1224',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#352848',
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
    backgroundColor: '#1e1528',
    borderWidth: 1,
    borderColor: '#3a3550',
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
    backgroundColor: '#1e1528',
    borderWidth: 1,
    borderColor: '#453d5c',
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
    backgroundColor: '#1e1528',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#352848',
    overflow: 'hidden',
  },
  sliderBarFill: {
    height: '100%',
    backgroundColor: '#6b5a8a',
    borderRadius: 5,
  },
  sliderValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#c4b8d4',
    marginTop: 4,
  },
  statePillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
  },
  statePillLabel: {
    color: '#9ab6d4',
    fontSize: 16,
    fontWeight: '500',
  },
  statePillGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  statePillBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2d323c',
    backgroundColor: '#141a22',
    minWidth: 56,
    alignItems: 'center',
  },
  statePillBtnSelected: {
    borderColor: '#4a7ab0',
    backgroundColor: '#1a2836',
    borderWidth: 2,
  },
  statePillOffText: {
    color: '#f87171',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statePillOnText: {
    color: '#86efac',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  batterySection: {
    marginBottom: 4,
  },
  batteryMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  batteryMetricIcon: {
    fontSize: 18,
  },
  /** Icon + “Battery:” + value — same pattern as central app. */
  batteryMetricText: {
    color: '#9ab6d4',
    fontSize: 16,
    fontWeight: '500',
  },
  batteryControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  batteryMiniBtn: {
    minWidth: 32,
    height: 28,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: '#1e1528',
    borderWidth: 1,
    borderColor: '#453d5c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  batteryMiniBtnText: {
    color: '#d1d5db',
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  batteryBarWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  batteryBarTrack: {
    width: '100%',
    height: 12,
    backgroundColor: '#1e1528',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#352848',
    overflow: 'hidden',
  },
  batteryBarFill: {
    height: '100%',
    backgroundColor: '#6b5a8a',
    borderRadius: 3,
  },
  ledControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 0,
  },
  ledSectionLabel: {
    color: '#9ab6d4',
    fontSize: 16,
    fontWeight: '500',
  },
  ledBulbEmoji: {
    fontSize: 26,
    lineHeight: 30,
    marginLeft: 8,
  },
  /** ON / OFF after the bulb icon. */
  ledStateText: {
    color: '#e4e7ec',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
    letterSpacing: 0.3,
  },
  ledBulbOff: {
    opacity: 0.35,
  },
  ledBulbOn: {
    opacity: 1,
    textShadowColor: '#e8c040',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  readonlyValue: {
    color: '#9ca3af',
    fontSize: 16,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
});
