import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  PermissionsAndroid,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import BleManager, { BleScanMode } from 'react-native-ble-manager';
import type { Peripheral } from 'react-native-ble-manager';
import { DEMO_TARGETS, type DemoTargetId } from './centralTargets';
import { readDeviceInformationService } from './disRead';
import { normUuid, uuidShort16 } from './uuid';

/** Unicode U+1F4A1 — same bulb as peripheral-app ProfileApp. */
const BULB_EMOJI = '\u{1F4A1}';
/** Unicode U+1F50B — battery icon before Battery label. */
const BATTERY_EMOJI = '\u{1F50B}';

type LogType = 'info' | 'event' | 'error' | 'data';

interface LogRow {
  id: string;
  t: string;
  type: LogType;
  message: string;
}

let logSeq = 0;

function valueToBytes(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value as number[];
  }
  if (value && typeof value === 'object' && 'length' in value) {
    return Array.from(value as ArrayLike<number>);
  }
  return [];
}

function parseHeartRateBytes(raw: unknown): string {
  const bytes = valueToBytes(raw);
  if (bytes.length < 2) {
    return `raw [${bytes.join(', ')}]`;
  }
  const flags = bytes[0] ?? 0;
  const eightBit = (flags & 0x01) === 0;
  const bpm = eightBit ? bytes[1]! : bytes[1]! | (bytes[2]! << 8);
  return `${bpm} BPM`;
}

/** Nordic LBS button characteristic: 0 = off, 1 = on, 255 = error state in profile. */
function formatLbsButtonState(byte: number): string {
  if (byte === 0) {
    return 'OFF';
  }
  if (byte === 1) {
    return 'ON';
  }
  if (byte === 255) {
    return 'Error';
  }
  return `Other (${byte})`;
}

async function requestAndroidBle(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  if (Platform.Version < 31) {
    const fine = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    return fine === PermissionsAndroid.RESULTS.GRANTED;
  }
  const res = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  ]);
  return (
    res['android.permission.BLUETOOTH_SCAN'] ===
      PermissionsAndroid.RESULTS.GRANTED &&
    res['android.permission.BLUETOOTH_CONNECT'] ===
      PermissionsAndroid.RESULTS.GRANTED
  );
}

/**
 * @param osServiceFilter true when the native scan used serviceUUIDs (OS already narrowed results).
 *        For Nordic LBS we often scan without that filter because 128‑bit service scan filters miss
 *        some peripherals; then we require a name hint or advertised LBS UUID so we do not list
 *        every anonymous BLE device.
 *
 * Rejects peripherals that clearly belong to another demo target (name or advertised service UUID),
 * so e.g. selecting Heart Rate does not list the Nordic LBS demo (`My_LBS`).
 *
 * For Nordic LBS, `osServiceFilter` is ignored for nameless peripherals (broad scan); only a
 * matching advertised service UUID or this target's name hints qualify.
 */
function matchesTarget(
  p: Peripheral,
  targetId: DemoTargetId,
  osServiceFilter: boolean
): boolean {
  const t = DEMO_TARGETS[targetId];
  const uuids = p.advertising?.serviceUUIDs;
  const targetUuid = normUuid(t.scanServiceUuid);
  const targetShort = uuidShort16(t.scanServiceUuid);

  let matchedThisTargetService = false;
  if (Array.isArray(uuids)) {
    for (const u of uuids) {
      const s = String(u);
      if (normUuid(s) === targetUuid || uuidShort16(s) === targetShort) {
        matchedThisTargetService = true;
        break;
      }
    }
    if (!matchedThisTargetService) {
      for (const otherId of Object.keys(DEMO_TARGETS) as DemoTargetId[]) {
        if (otherId === targetId) {
          continue;
        }
        const other = DEMO_TARGETS[otherId];
        const ou = normUuid(other.scanServiceUuid);
        const os = uuidShort16(other.scanServiceUuid);
        for (const u of uuids) {
          const s = String(u);
          if (normUuid(s) === ou || uuidShort16(s) === os) {
            return false;
          }
        }
      }
    }
  }

  if (matchedThisTargetService) {
    return true;
  }

  const name = (p.name || p.advertising?.localName || '')
    .trim()
    .toLowerCase();
  if (name) {
    for (const otherId of Object.keys(DEMO_TARGETS) as DemoTargetId[]) {
      if (otherId === targetId) {
        continue;
      }
      const other = DEMO_TARGETS[otherId];
      if (
        other.nameHints.some((h) => h.length > 0 && name.includes(h))
      ) {
        return false;
      }
    }
    return t.nameHints.some((h) => h.length > 0 && name.includes(h));
  }
  // Nordic LBS uses a broad scan (no OS service filter). Never treat "anonymous"
  // peripherals as pre-filtered — stale ref from a previous HR scan or the initial
  // ref=true would otherwise list unrelated devices (e.g. RN_BLE_HR_Demo).
  return osServiceFilter && targetId !== 'nordic-lbs';
}

export default function CentralApp() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [bleOk, setBleOk] = useState(false);
  const [targetId, setTargetId] = useState<DemoTargetId>('nordic-lbs');
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<Peripheral[]>([]);
  const [connected, setConnected] = useState<Peripheral | null>(null);
  const [busy, setBusy] = useState(false);
  const [hrLine, setHrLine] = useState<string>('--');
  const [batteryLine, setBatteryLine] = useState<string>('--');
  const [buttonLine, setButtonLine] = useState<string>('--');
  /** Last known LED on peripheral (read on connect + updated after writes). */
  const [ledLit, setLedLit] = useState(false);
  const [deviceInfoExpanded, setDeviceInfoExpanded] = useState(false);
  const [deviceInfoRows, setDeviceInfoRows] = useState<
    { label: string; value: string }[] | null
  >(null);
  const [deviceInfoLoading, setDeviceInfoLoading] = useState(false);
  const deviceMapRef = useRef<Map<string, Peripheral>>(new Map());
  /** Matches `matchesTarget` third arg — set in handleScan before BleManager.scan. */
  const osServiceScanFilterRef = useRef(false);
  /** `scan()`'s Promise resolves when the scan *starts* (iOS/Android), not when it ends. */
  const scanFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanGenerationRef = useRef(0);

  const clearScanFallbackTimer = useCallback(() => {
    if (scanFallbackTimerRef.current != null) {
      clearTimeout(scanFallbackTimerRef.current);
      scanFallbackTimerRef.current = null;
    }
  }, []);

  const addLog = useCallback((type: LogType, message: string) => {
    const t = new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const id = String(++logSeq);
    setLogs((prev) => [{ id, t, type, message }, ...prev.slice(0, 199)]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await BleManager.start({ showAlert: false });
        if (!cancelled) {
          setBleOk(true);
          addLog('info', 'BLE manager started');
        }
      } catch (e) {
        addLog('error', `BLE start failed: ${e}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addLog]);

  useEffect(() => {
    const sub = BleManager.onDiscoverPeripheral((p) => {
      if (!matchesTarget(p, targetId, osServiceScanFilterRef.current)) {
        if (deviceMapRef.current.has(p.id)) {
          deviceMapRef.current.delete(p.id);
          setDevices(Array.from(deviceMapRef.current.values()));
        }
        return;
      }
      addLog('data', `Discovered: ${JSON.stringify(p)}`);
      deviceMapRef.current.set(p.id, p);
      setDevices(Array.from(deviceMapRef.current.values()));
    });
    return () => sub.remove();
  }, [addLog, targetId]);

  useEffect(() => {
    const sub = BleManager.onDidUpdateValueForCharacteristic((e) => {
      const chShort = uuidShort16(e.characteristic);
      const hr = DEMO_TARGETS['heart-rate-monitor'].services.heartRate;
      const bat = DEMO_TARGETS['heart-rate-monitor'].services.battery;
      const lbs = DEMO_TARGETS['nordic-lbs'].services.lbs;

      if (hr && uuidShort16(hr.measurement) === chShort) {
        const line = parseHeartRateBytes(e.value);
        setHrLine(line);
        addLog('data', `Notify HR: ${line}`);
        return;
      }
      if (bat && uuidShort16(bat.level) === chShort) {
        const v = valueToBytes(e.value)[0] ?? 0;
        setBatteryLine(`${v}%`);
        addLog('data', `Notify battery: ${v}%`);
        return;
      }
      if (lbs && uuidShort16(lbs.button) === chShort) {
        const v = valueToBytes(e.value)[0] ?? 0;
        const line = formatLbsButtonState(v);
        setButtonLine(line);
        addLog('data', `Notify button: ${line}`);
      }
    });
    return () => sub.remove();
  }, [addLog]);

  useEffect(() => {
    const sub = BleManager.onDisconnectPeripheral(() => {
      setConnected(null);
      setLedLit(false);
      setHrLine('--');
      setBatteryLine('--');
      setButtonLine('--');
      setDeviceInfoExpanded(false);
      setDeviceInfoRows(null);
      addLog('event', 'Disconnected');
    });
    return () => sub.remove();
  }, [addLog]);

  useEffect(() => {
    if (!deviceInfoExpanded || !connected) {
      return;
    }
    if (deviceInfoRows !== null) {
      return;
    }
    let cancelled = false;
    setDeviceInfoLoading(true);
    readDeviceInformationService(connected.id)
      .then((rows) => {
        if (!cancelled) {
          setDeviceInfoRows(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDeviceInfoRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDeviceInfoLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [deviceInfoExpanded, connected, deviceInfoRows]);

  useEffect(() => {
    const sub = BleManager.onStopScan(() => {
      clearScanFallbackTimer();
      setScanning(false);
      addLog('info', 'Scan finished');
    });
    return () => {
      sub.remove();
      clearScanFallbackTimer();
    };
  }, [addLog, clearScanFallbackTimer]);

  const SCAN_DURATION_SEC = 8;

  const handleScan = useCallback(async () => {
    const ok = await requestAndroidBle();
    if (!ok) {
      addLog('error', 'Bluetooth permissions denied');
      return;
    }
    const target = DEMO_TARGETS[targetId];
    const gen = ++scanGenerationRef.current;
    clearScanFallbackTimer();

    const useOsServiceFilter = targetId !== 'nordic-lbs';
    osServiceScanFilterRef.current = useOsServiceFilter;

    deviceMapRef.current.clear();
    setDevices([]);
    setScanning(true);
    addLog(
      'info',
      useOsServiceFilter
        ? `Scanning for ${target.label} (${SCAN_DURATION_SEC}s, service filter)…`
        : `Scanning for ${target.label} (${SCAN_DURATION_SEC}s, broad + name/UUID match)…`
    );
    try {
      await BleManager.scan({
        serviceUUIDs: useOsServiceFilter ? [target.scanServiceUuid] : [],
        seconds: SCAN_DURATION_SEC,
        ...(Platform.OS === 'android' && !useOsServiceFilter
          ? { scanMode: BleScanMode.LowLatency }
          : {}),
      });
      // Native stops the scan after `seconds`; JS Promise above usually completes on *start*.
      scanFallbackTimerRef.current = setTimeout(() => {
        scanFallbackTimerRef.current = null;
        if (scanGenerationRef.current !== gen) {
          return;
        }
        setScanning(false);
        addLog('info', 'Scan finished');
      }, SCAN_DURATION_SEC * 1000 + 500);
    } catch (e) {
      clearScanFallbackTimer();
      setScanning(false);
      addLog('error', `Scan error: ${e}`);
    }
  }, [addLog, clearScanFallbackTimer, targetId]);

  const setupHeart = useCallback(
    async (peripheralId: string) => {
      const hr = DEMO_TARGETS['heart-rate-monitor'].services.heartRate!;
      const bat = DEMO_TARGETS['heart-rate-monitor'].services.battery!;
      await BleManager.retrieveServices(peripheralId);
      addLog('info', 'Services discovered');
      try {
        await BleManager.startNotification(
          peripheralId,
          hr.service,
          hr.measurement
        );
      } catch (e) {
        if (Platform.OS === 'ios') {
          addLog('info', 'HR notify: retry with short UUIDs (180D / 2A37)');
          await BleManager.startNotification(peripheralId, '180D', '2A37');
        } else {
          throw e;
        }
      }
      await BleManager.startNotification(
        peripheralId,
        bat.service,
        bat.level
      );
      try {
        const batBytes = await BleManager.read(
          peripheralId,
          bat.service,
          bat.level
        );
        setBatteryLine(`${batBytes[0] ?? 0}% (read)`);
      } catch {
        /* optional */
      }
      addLog('info', 'Subscribed: HR + battery notifications');
    },
    [addLog]
  );

  const setupNordic = useCallback(
    async (peripheralId: string) => {
      const lbs = DEMO_TARGETS['nordic-lbs'].services.lbs!;
      const bat = DEMO_TARGETS['nordic-lbs'].services.battery!;
      const peripheralInfo = await BleManager.retrieveServices(peripheralId);
      console.log('peripheralInfo', JSON.stringify({peripheralInfo, lbs, bat}));
      addLog('info', 'Services discovered: ' + JSON.stringify({peripheralInfo, lbs, bat}));
      await BleManager.startNotification(
        peripheralId,
        lbs.service,
        lbs.button
      );
      addLog('info', `Subscribed: button notification: ${lbs.button}`);
      await BleManager.startNotification(
        peripheralId,
        bat.service,
        bat.level
      );
      addLog('info', `Subscribed: battery notification: ${bat.level}`);
      try {
        const batBytes = await BleManager.read(
          peripheralId,
          bat.service,
          bat.level
        );
        setBatteryLine(`${batBytes[0] ?? 0}%`);
      } catch {
        /* optional */
      }
      try {
        const btnBytes = await BleManager.read(
          peripheralId,
          lbs.service,
          lbs.button
        );
        setButtonLine(formatLbsButtonState(btnBytes[0] ?? 0));
      } catch {
        /* optional — UI stays at -- until first notify */
      }
      try {
        const ledBytes = await BleManager.read(
          peripheralId,
          lbs.service,
          lbs.led
        );
        setLedLit((ledBytes[0] ?? 0) !== 0);
      } catch {
        setLedLit(false);
      }
      addLog('info', 'Subscribed: button + battery notifications');
    },
    [addLog]
  );

  const handleConnect = useCallback(
    async (p: Peripheral) => {
      clearScanFallbackTimer();
      scanGenerationRef.current += 1;
      setScanning(false);
      try {
        await BleManager.stopScan();
      } catch {
        /* not scanning or native already idle */
      }
      setBusy(true);
      setDeviceInfoExpanded(false);
      setDeviceInfoRows(null);
      try {
        await BleManager.connect(p.id);
        setConnected(p);
        setHrLine('--');
        setBatteryLine('--');
        setButtonLine('--');
        addLog('event', `Connected: ${p.name || p.id}`);
        if (targetId === 'heart-rate-monitor') {
          await setupHeart(p.id);
        } else {
          await setupNordic(p.id);
        }
      } catch (e) {
        addLog('error', `Connect failed: ${e}`);
      } finally {
        setBusy(false);
      }
    },
    [addLog, clearScanFallbackTimer, setupHeart, setupNordic, targetId]
  );

  const handleDisconnect = useCallback(async () => {
    if (!connected) {
      return;
    }
    setBusy(true);
    try {
      await BleManager.disconnect(connected.id);
    } catch (e) {
      addLog('error', `Disconnect: ${e}`);
    } finally {
      setConnected(null);
      setHrLine('--');
      setBatteryLine('--');
      setButtonLine('--');
      setDeviceInfoExpanded(false);
      setDeviceInfoRows(null);
      setBusy(false);
    }
  }, [addLog, connected]);

  const toggleDeviceInfo = useCallback(() => {
    setDeviceInfoExpanded((v) => !v);
  }, []);

  const writeLed = useCallback(
    async (on: boolean) => {
      if (!connected || targetId !== 'nordic-lbs') {
        return;
      }
      const lbs = DEMO_TARGETS['nordic-lbs'].services.lbs!;
      setBusy(true);
      try {
        await BleManager.writeWithoutResponse(
          connected.id,
          lbs.service,
          lbs.led,
          [on ? 1 : 0]
        );
        setLedLit(on);
        addLog('data', `LED write: ${on ? 'ON' : 'OFF'}`);
      } catch (e) {
        addLog('error', `LED write failed: ${e}`);
      } finally {
        setBusy(false);
      }
    },
    [addLog, connected, targetId]
  );

  const clearLogs = () => setLogs([]);

  /** While connected, target and scan must stay fixed until disconnect. */
  const profileAndScanLocked = connected != null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.main, showLogs && styles.mainWithLogs]}>
        <View style={styles.header}>
          <Text style={styles.title}>BLE Central App</Text>
          {/* <Text style={styles.sub}>
            Matches peripheral profiles in ../profiles (scan by service UUID).
          </Text> */}
        </View>
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          <Text style={styles.section}>Target profile</Text>
          {(Object.keys(DEMO_TARGETS) as DemoTargetId[]).map((id) => {
            const sel = targetId === id;
            return (
              <TouchableOpacity
                key={id}
                testID={`central-target-${id}`}
                accessibilityLabel={`Central target ${DEMO_TARGETS[id].label}`}
                accessibilityState={{ disabled: profileAndScanLocked }}
                disabled={profileAndScanLocked}
                style={[
                  styles.card,
                  sel && styles.cardSel,
                  profileAndScanLocked && styles.cardDisabled,
                ]}
                onPress={() => {
                  setTargetId(id);
                  deviceMapRef.current.clear();
                  setDevices([]);
                  addLog('info', `Target: ${DEMO_TARGETS[id].label}`);
                }}
              >
                <Text style={styles.cardTitle}>{DEMO_TARGETS[id].label}</Text>
                <Text style={styles.cardHint}>
                  [{DEMO_TARGETS[id].nameHints.join(', ')}]
                </Text>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            testID="central-scan"
            accessibilityLabel={
              profileAndScanLocked
                ? 'Central scan disabled while connected'
                : scanning
                  ? 'Central scan scanning'
                  : 'Central scan eight seconds'
            }
            accessibilityState={{ disabled: !bleOk || scanning || profileAndScanLocked }}
            style={[
              styles.btn,
              (scanning || profileAndScanLocked) && styles.btnDisabled,
            ]}
            onPress={handleScan}
            disabled={!bleOk || scanning || profileAndScanLocked}
          >
            <Text style={styles.btnText}>
              {scanning ? 'Scanning…' : 'Scan'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.section}>Devices</Text>
          {devices.length === 0 ? (
            <Text style={styles.muted}>No matching peripherals yet.</Text>
          ) : (
            devices.map((d) => {
              const deviceTitle = (
                d.name ||
                d.advertising?.localName ||
                ''
              ).trim();
              const deviceA11yName = deviceTitle || d.id;
              const isThisConnected = connected?.id === d.id;
              return (
                <View
                  key={d.id}
                  testID={`central-device-${d.id}`}
                  accessibilityLabel={
                    isThisConnected
                      ? `Central device ${deviceA11yName} connected`
                      : undefined
                  }
                  style={[
                    styles.deviceRow,
                    isThisConnected && styles.deviceRowConnected,
                  ]}
                >
                  {isThisConnected ? (
                    <>
                      <View style={styles.deviceCardHeader}>
                        <View style={styles.deviceHeaderLeft}>
                          <Text style={styles.deviceName}>{deviceTitle || '(no name)'}</Text>
                          <Text style={styles.deviceId}>{d.id}</Text>
                        </View>
                        <View style={styles.deviceHeaderActions}>
                          <TouchableOpacity
                            testID="central-device-info"
                            accessibilityLabel={
                              deviceInfoExpanded
                                ? 'Central device information expanded'
                                : 'Central show device information'
                            }
                            style={[
                              styles.deviceInfoSmall,
                              deviceInfoExpanded && styles.deviceInfoSmallActive,
                            ]}
                            onPress={toggleDeviceInfo}
                            disabled={busy}
                          >
                            <Text
                              style={[
                                styles.deviceInfoSmallText,
                                deviceInfoExpanded && styles.deviceInfoSmallTextActive,
                              ]}
                            >
                              Info
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            testID="central-disconnect"
                            accessibilityLabel="Central disconnect"
                            style={styles.deviceDisconnectSmall}
                            onPress={handleDisconnect}
                            disabled={busy}
                          >
                            <Text style={styles.deviceDisconnectSmallText}>Disconnect</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                      {deviceInfoExpanded && (
                        <View style={styles.deviceInfoPanel}>
                          {deviceInfoLoading ? (
                            <ActivityIndicator color="#8ab4d8" />
                          ) : deviceInfoRows && deviceInfoRows.length > 0 ? (
                            deviceInfoRows.map((row) => (
                              <View key={row.label} style={styles.deviceInfoLine}>
                                <Text style={styles.deviceInfoLabel}>{row.label}</Text>
                                <Text style={styles.deviceInfoValue} selectable>
                                  {row.value}
                                </Text>
                              </View>
                            ))
                          ) : (
                            <Text style={styles.deviceInfoEmpty}>
                              No device information could be read (DIS may be absent).
                            </Text>
                          )}
                        </View>
                      )}
                      {targetId === 'heart-rate-monitor' && (
                        <>
                          <Text testID="central-metric-hr" style={styles.metric}>
                            HR: {hrLine}
                          </Text>
                          <View style={styles.metricRow}>
                            <Text style={styles.metricBatteryIcon}>{BATTERY_EMOJI}</Text>
                            <Text testID="central-metric-battery" style={styles.metric}>
                              Battery: {batteryLine}
                            </Text>
                          </View>
                        </>
                      )}
                      {targetId === 'nordic-lbs' && (
                        <>
                          <View style={styles.metricSplitRow}>
                            <View style={styles.metricSplitLeft}>
                              <Text
                                testID="central-metric-button"
                                style={[styles.metric, styles.metricInSplit]}
                              >
                                <Text style={styles.metricPlain}>Button state: </Text>
                                <Text
                                  style={
                                    buttonLine === 'ON'
                                      ? styles.metricStateOn
                                      : buttonLine === 'OFF'
                                        ? styles.metricStateOff
                                        : buttonLine === 'Error'
                                          ? styles.metricStateError
                                          : styles.metricStateMuted
                                  }
                                >
                                  {buttonLine}
                                </Text>
                              </Text>
                            </View>
                            <View style={styles.metricSplitRight}>
                              <Text style={styles.metricBatteryIcon}>{BATTERY_EMOJI}</Text>
                              <Text
                                testID="central-metric-battery"
                                style={[styles.metric, styles.metricInSplit]}
                              >
                                Battery: {batteryLine}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.ledControlRow}>
                            <Text style={styles.ledSectionLabel}>LED:</Text>
                            <View style={styles.ledBtnGroup}>
                              <TouchableOpacity
                                testID="central-led-on"
                                accessibilityLabel="Central LED on"
                                style={[
                                  styles.ledPillBtn,
                                  ledLit && styles.ledPillBtnSelected,
                                ]}
                                onPress={() => writeLed(true)}
                                disabled={busy}
                              >
                                <Text style={[styles.ledPillEmoji, styles.ledEmojiOn]}>
                                  {BULB_EMOJI}
                                </Text>
                                <Text style={styles.ledPillCaption}>ON</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                testID="central-led-off"
                                accessibilityLabel="Central LED off"
                                style={[
                                  styles.ledPillBtn,
                                  !ledLit && styles.ledPillBtnSelected,
                                ]}
                                onPress={() => writeLed(false)}
                                disabled={busy}
                              >
                                <Text style={[styles.ledPillEmoji, styles.ledEmojiOff]}>
                                  {BULB_EMOJI}
                                </Text>
                                <Text style={styles.ledPillCaption}>OFF</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </>
                      )}
                    </>
                  ) : (
                    <View style={styles.deviceCardHeader}>
                      <View style={styles.deviceHeaderLeft}>
                        <Text style={styles.deviceName}>{deviceTitle || '(no name)'}</Text>
                        <Text style={styles.deviceId}>{d.id}</Text>
                      </View>
                      {connected ? (
                        <Text style={styles.deviceHeaderHint} numberOfLines={2}>
                          Disconnect other device first
                        </Text>
                      ) : (
                        <TouchableOpacity
                          testID={`central-connect-${d.id}`}
                          accessibilityLabel={`Central connect ${deviceA11yName}`}
                          style={styles.deviceConnectSmall}
                          onPress={() => handleConnect(d)}
                          disabled={busy}
                        >
                          <Text style={styles.deviceConnectSmallText}>Connect</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}

          {busy && <ActivityIndicator color="#8ab4d8" style={{ marginTop: 12 }} />}
        </ScrollView>
      </View>

      {showLogs && (
        <View style={styles.logPanel}>
          <View style={styles.logHeader}>
            <Text style={styles.section}>Logs</Text>
            <TouchableOpacity onPress={clearLogs}>
              <Text style={styles.link}>Clear</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.logScroll}>
            {logs.map((row) => (
              <Text key={row.id} style={styles.logLine}>
                <Text style={styles.logTime}>{row.t}</Text>{' '}
                <Text
                  style={
                    row.type === 'error'
                      ? styles.logErr
                      : row.type === 'data'
                        ? styles.logData
                        : styles.logInfo
                  }
                >
                  {row.message}
                </Text>
              </Text>
            ))}
          </ScrollView>
        </View>
      )}
      <TouchableOpacity
        testID="central-toggle-logs"
        accessibilityLabel={showLogs ? 'Hide central logs' : 'Show central logs'}
        style={styles.fab}
        onPress={() => setShowLogs((prev) => !prev)}
      >
        <Text style={styles.fabText}>{showLogs ? 'Logs–' : 'Logs+'}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f1f3d' },
  main: {
    flex: 1,
  },
  mainWithLogs: {
    paddingBottom: '30%',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1e3a8a',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  title: {
    color: '#eceff4',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  sub: { color: '#8b949e', fontSize: 13, marginBottom: 16 },
  section: {
    color: '#a8b0bd',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#1a1d24',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2d323c',
    flexDirection: 'row',
  },
  cardSel: { borderColor: '#4a7ab0', backgroundColor: '#1a2228' },
  cardDisabled: { opacity: 0.45 },
  cardTitle: { color: '#e4e7ec', fontSize: 16, fontWeight: '600' },
  cardHint: { color: '#8b949e', fontSize: 12, marginTop: 4, marginLeft: 4 },
  btn: {
    marginTop: 12,
    backgroundColor: '#1e3d2a',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3d6b4f',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#e4e7ec', fontWeight: '600' },
  muted: { color: '#6b7280', fontSize: 14 },
  deviceRow: {
    backgroundColor: '#16181f',
    padding: 12,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#2d323c',
  },
  deviceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  deviceHeaderLeft: {
    flex: 1,
    marginRight: 8,
    minWidth: 0,
  },
  deviceHeaderHint: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '500',
    maxWidth: 112,
    textAlign: 'right',
    lineHeight: 15,
  },
  deviceConnectSmall: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#1e3d2a',
    borderWidth: 1,
    borderColor: '#3d6b4f',
    alignSelf: 'flex-start',
  },
  deviceConnectSmallText: {
    color: '#d1fae5',
    fontWeight: '600',
    fontSize: 12,
  },
  deviceDisconnectSmall: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#3a2226',
    borderWidth: 1,
    borderColor: '#6b4548',
    alignSelf: 'flex-start',
  },
  deviceDisconnectSmallText: {
    color: '#e8d6d8',
    fontWeight: '600',
    fontSize: 12,
  },
  deviceHeaderActions: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    flexShrink: 0,
  },
  deviceInfoSmall: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#121820',
    borderWidth: 1,
    borderColor: '#283545',
    alignSelf: 'flex-start',
  },
  deviceInfoSmallActive: {
    backgroundColor: '#2d3f54',
    borderColor: '#6b8fc4',
  },
  deviceInfoSmallText: {
    color: '#7d8a99',
    fontWeight: '600',
    fontSize: 12,
  },
  deviceInfoSmallTextActive: {
    color: '#e8eaed',
  },
  deviceInfoPanel: {
    marginTop: 12,
    paddingTop: 12,
    paddingHorizontal: 2,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: '#2d323c',
  },
  deviceInfoLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  deviceInfoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8b949e',
    width: 118,
    flexShrink: 0,
    paddingTop: 1,
  },
  deviceInfoValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: '#e4e7ec',
    lineHeight: 19,
  },
  deviceInfoEmpty: {
    fontSize: 13,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  deviceName: { color: '#e4e7ec', fontSize: 15, fontWeight: '600' },
  deviceId: { color: '#8b949e', fontSize: 11, marginTop: 2 },
  deviceRowConnected: {
    borderColor: '#4a7ab0',
    backgroundColor: '#141a22',
  },
  mono: { color: '#c9d1d9', fontSize: 12 },
  metric: { color: '#9ab6d4', fontSize: 16, marginTop: 8 },
  /** Inside `metricSplitRow`, avoid double vertical spacing. */
  metricInSplit: { marginTop: 0 },
  metricPlain: { color: '#9ab6d4', fontSize: 16 },
  metricSplitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  metricSplitLeft: {
    flex: 1,
    minWidth: 0,
    marginRight: 4,
  },
  metricSplitRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    marginLeft: 4,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  metricBatteryIcon: { fontSize: 18 },
  metricStateOn: { color: '#86efac', fontWeight: '700', fontSize: 16 },
  metricStateOff: { color: '#f87171', fontWeight: '700', fontSize: 16 },
  metricStateError: { color: '#fbbf24', fontWeight: '700', fontSize: 16 },
  metricStateMuted: { color: '#6b7280', fontSize: 16 },
  ledControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 12,
  },
  ledSectionLabel: {
    color: '#9ab6d4',
    fontSize: 16,
    fontWeight: '500',
  },
  /** Small gap after “LED:” before ON / OFF pills. */
  ledBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    marginLeft: 8,
  },
  ledPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2d323c',
    backgroundColor: '#141a22',
    gap: 6,
  },
  ledPillBtnSelected: {
    borderColor: '#4a7ab0',
    backgroundColor: '#1a2836',
    borderWidth: 2,
  },
  ledPillEmoji: {
    fontSize: 22,
    lineHeight: 26,
  },
  ledEmojiOff: {
    opacity: 0.35,
  },
  ledEmojiOn: {
    opacity: 1,
    textShadowColor: '#e8c040',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  ledPillCaption: {
    color: '#c9d1d9',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  link: { color: '#9ab6d4', fontSize: 14 },
  logLine: { marginBottom: 4 },
  logTime: { color: '#6b7280', fontSize: 11 },
  logInfo: { color: '#c9d1d9', fontSize: 12 },
  logErr: { color: '#f59e9b', fontSize: 12 },
  logData: { color: '#86efac', fontSize: 12 },
  logPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '30%',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: '#0a162c',
    borderTopWidth: 1,
    borderTopColor: '#1e3a8a',
  },
  logScroll: {
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#1e3a8a',
    borderWidth: 1,
    borderColor: '#2563eb',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabText: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '600',
  },
});
