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
  useWindowDimensions,
} from 'react-native';
import {
  ManagerState,
  onDidUpdateState,
  getStateDescription,
  type EventDidUpdateState,
} from 'react-native-ble-peripheral-manager';

import { ProfileEngine } from './profiles/profileEngine';
import { BUNDLED_PROFILES } from './profiles/profileRegistry';
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
import { LBS_LED_CHAR_UUID } from './constants/bleUuids';

/** Unicode U+1F4A1 (electric light bulb) — dims via opacity when LED off, glow when on */
const BULB_EMOJI = '\u{1F4A1}';

/** Default local profile for first paint and when returning from Remote source. */
const DEFAULT_LOCAL_PROFILE =
  BUNDLED_PROFILES.find((p) => p.id === 'nordic-lbs') ?? null;

function normUuid(u: string): string {
  return u.replace(/-/g, '').toLowerCase();
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
    const isBatteryLevelChar = normUuid(charUUID) === '2a19';

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
            accessible={isBatteryLevelChar}
            accessibilityLabel={
              isBatteryLevelChar ? 'Peripheral battery plus ten' : undefined
            }
            testID={`${charTestBase}-slider-plus-step`}
            style={styles.sliderButton}
            onPress={() =>
              handleValueChange(serviceUUID, charUUID, Math.min(max, value + step))
            }
            activeOpacity={0.7}
          >
            <Text
              style={styles.sliderButtonText}
              accessible={isBatteryLevelChar ? false : undefined}
            >
              +{step}
            </Text>
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
    return (
      <View>
        <Text style={styles.controlLabel} accessible={false}>
          {ui.label}
        </Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel} accessible={false}>
            {isOn ? 'ON' : 'OFF'}
          </Text>
          <Switch
            accessible
            testID={`${charTestBase}-switch`}
            accessibilityLabel="Peripheral LBS button switch"
            value={isOn}
            onValueChange={(newVal) =>
              handleValueChange(serviceUUID, charUUID, newVal ? 1 : 0)
            }
            trackColor={{ false: '#352848', true: '#3d2d52' }}
            thumbColor={isOn ? '#a78bfa' : '#6b5a7a'}
          />
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
        <View>
          <Text style={styles.controlLabel}>{ui.label}</Text>
          <View style={styles.ledRow}>
            <Text
              style={[
                styles.ledEmoji,
                lit ? styles.ledEmojiOn : styles.ledEmojiOff,
              ]}
              accessibilityLabel={lit ? 'LED on' : 'LED dim'}
            >
              {BULB_EMOJI}
            </Text>
            <Text
              style={[styles.ledVerbal, lit ? styles.ledVerbalOn : styles.ledVerbalOff]}
            >
              {lit ? 'LED: ON' : 'LED: OFF'}
            </Text>
          </View>
          {/* <Text
            testID="peripheral-lbs-led-state-text"
            accessibilityLabel={
              lit ? 'Peripheral LED automation ON' : 'Peripheral LED automation OFF'
            }
            style={styles.ledAutomationText}
          >
            {`LED: ${lit ? 'ON' : 'OFF'}`}
          </Text> */}
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
  ledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  ledEmoji: {
    fontSize: 44,
    lineHeight: 50,
  },
  ledEmojiOff: {
    opacity: 0.2,
  },
  ledEmojiOn: {
    opacity: 1,
    textShadowColor: '#e8c040',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  ledVerbal: {
    fontSize: 15,
    fontWeight: '600',
  },
  ledVerbalOff: {
    color: '#6b7280',
  },
  ledVerbalOn: {
    color: '#e8d089',
  },
  ledAutomationText: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '600',
    color: '#c4b5fd',
  },
});
