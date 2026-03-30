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
import { normUuid } from './uuid';

type LogType = 'info' | 'event' | 'error' | 'data';

interface LogRow {
  id: string;
  t: string;
  type: LogType;
  message: string;
}

let logSeq = 0;

function parseHeartRateBytes(bytes: number[]): string {
  if (bytes.length < 2) {
    return `raw [${bytes.join(', ')}]`;
  }
  const flags = bytes[0] ?? 0;
  const eightBit = (flags & 0x01) === 0;
  const bpm = eightBit ? bytes[1]! : bytes[1]! | (bytes[2]! << 8);
  return `${bpm} BPM`;
}

/** Nordic LBS button characteristic: 0 = released, 1 = pressed, 255 = error state in profile. */
function formatLbsButtonState(byte: number): string {
  if (byte === 0) {
    return 'Released';
  }
  if (byte === 1) {
    return 'Pressed';
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
 */
function matchesTarget(
  p: Peripheral,
  targetId: DemoTargetId,
  osServiceFilter: boolean
): boolean {
  const t = DEMO_TARGETS[targetId];
  const uuids = p.advertising?.serviceUUIDs;
  const targetUuid = normUuid(t.scanServiceUuid);
  if (Array.isArray(uuids)) {
    for (const u of uuids) {
      if (normUuid(String(u)) === targetUuid) {
        return true;
      }
    }
  }
  const name = (p.name || p.advertising?.localName || '')
    .trim()
    .toLowerCase();
  if (name) {
    return t.nameHints.some((h) => name.includes(h));
  }
  return osServiceFilter;
}

export default function CentralApp() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [bleOk, setBleOk] = useState(false);
  const [targetId, setTargetId] = useState<DemoTargetId>('heart-rate-monitor');
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<Peripheral[]>([]);
  const [connected, setConnected] = useState<Peripheral | null>(null);
  const [busy, setBusy] = useState(false);
  const [hrLine, setHrLine] = useState<string>('--');
  const [batteryLine, setBatteryLine] = useState<string>('--');
  const [buttonLine, setButtonLine] = useState<string>('--');
  const deviceMapRef = useRef<Map<string, Peripheral>>(new Map());
  /** Matches `matchesTarget` third arg — set in handleScan before BleManager.scan. */
  const osServiceScanFilterRef = useRef(true);
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
      const ch = normUuid(e.characteristic);
      const hr = DEMO_TARGETS['heart-rate-monitor'].services.heartRate;
      const bat = DEMO_TARGETS['heart-rate-monitor'].services.battery;
      const lbs = DEMO_TARGETS['nordic-lbs'].services.lbs;

      if (hr && normUuid(hr.measurement) === ch) {
        const line = parseHeartRateBytes(e.value);
        setHrLine(line);
        addLog('data', `Notify HR: ${line}`);
        return;
      }
      if (bat && normUuid(bat.level) === ch) {
        const v = e.value[0] ?? 0;
        setBatteryLine(`${v}%`);
        addLog('data', `Notify battery: ${v}%`);
        return;
      }
      if (lbs && normUuid(lbs.button) === ch) {
        const v = e.value[0] ?? 0;
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
      addLog('event', 'Disconnected');
    });
    return () => sub.remove();
  }, [addLog]);

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
      await BleManager.startNotification(
        peripheralId,
        hr.service,
        hr.measurement
      );
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
      await BleManager.retrieveServices(peripheralId);
      addLog('info', 'Services discovered');
      await BleManager.startNotification(
        peripheralId,
        lbs.service,
        lbs.button
      );
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
        setBatteryLine(`${batBytes[0] ?? 0}%`);
      } catch {
        /* optional */
      }
      addLog('info', 'Subscribed: button + battery notifications');
    },
    [addLog]
  );

  const handleConnect = useCallback(
    async (p: Peripheral) => {
      setBusy(true);
      try {
        await BleManager.connect(p.id);
        setConnected(p);
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
    [addLog, setupHeart, setupNordic, targetId]
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
      setBusy(false);
    }
  }, [addLog, connected]);

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

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>BLE Central Demo</Text>
        <Text style={styles.sub}>
          Matches peripheral profiles in ../profiles (scan by service UUID).
        </Text>

        <Text style={styles.section}>Target profile</Text>
        {(Object.keys(DEMO_TARGETS) as DemoTargetId[]).map((id) => {
          const sel = targetId === id;
          return (
            <TouchableOpacity
              key={id}
              testID={`central-target-${id}`}
              accessibilityLabel={`Central target ${DEMO_TARGETS[id].label}`}
              style={[styles.card, sel && styles.cardSel]}
              onPress={() => {
                setTargetId(id);
                deviceMapRef.current.clear();
                setDevices([]);
                addLog('info', `Target: ${DEMO_TARGETS[id].label}`);
              }}
            >
              <Text style={styles.cardTitle}>{DEMO_TARGETS[id].label}</Text>
              <Text style={styles.cardHint}>
                Names: {DEMO_TARGETS[id].nameHints.join(', ')}
              </Text>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          testID="central-scan"
          accessibilityLabel={scanning ? 'Central scan scanning' : 'Central scan eight seconds'}
          style={[styles.btn, scanning && styles.btnDisabled]}
          onPress={handleScan}
          disabled={!bleOk || scanning}
        >
          <Text style={styles.btnText}>
            {scanning ? 'Scanning…' : 'Scan (8s)'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.section}>Devices</Text>
        {devices.length === 0 ? (
          <Text style={styles.muted}>No matching peripherals yet.</Text>
        ) : (
          devices.map((d) => (
            <TouchableOpacity
              key={d.id}
              testID={`central-device-${d.id}`}
              accessibilityLabel={`Central device ${d.name || d.id}`}
              style={styles.deviceRow}
              onPress={() => handleConnect(d)}
              disabled={!!connected || busy}
            >
              <Text style={styles.deviceName}>{d.name || '(no name)'}</Text>
              <Text style={styles.deviceId}>{d.id}</Text>
            </TouchableOpacity>
          ))
        )}

        {connected && (
          <View style={styles.box}>
            <Text style={styles.section}>Connected</Text>
            <Text style={styles.mono}>
              {connected.name || connected.id}
            </Text>
            {targetId === 'heart-rate-monitor' && (
              <>
                <Text testID="central-metric-hr" style={styles.metric}>
                  HR: {hrLine}
                </Text>
                <Text testID="central-metric-battery" style={styles.metric}>
                  Battery: {batteryLine}
                </Text>
              </>
            )}
            {targetId === 'nordic-lbs' && (
              <>
                <Text testID="central-metric-button" style={styles.metric}>
                  Button: {buttonLine}
                </Text>
                <Text testID="central-metric-battery" style={styles.metric}>
                  Battery: {batteryLine}
                </Text>
                <View style={styles.row}>
                  <TouchableOpacity
                    testID="central-led-on"
                    accessibilityLabel="Central LED on"
                    style={styles.smallBtn}
                    onPress={() => writeLed(true)}
                    disabled={busy}
                  >
                    <Text style={styles.btnText}>LED ON</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="central-led-off"
                    accessibilityLabel="Central LED off"
                    style={styles.smallBtn}
                    onPress={() => writeLed(false)}
                    disabled={busy}
                  >
                    <Text style={styles.btnText}>LED OFF</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            <TouchableOpacity style={styles.btnDanger} onPress={handleDisconnect}>
              <Text style={styles.btnText}>Disconnect</Text>
            </TouchableOpacity>
          </View>
        )}

        {busy && <ActivityIndicator color="#8ab4d8" style={{ marginTop: 12 }} />}

        <View style={styles.logHeader}>
          <Text style={styles.section}>Logs</Text>
          <TouchableOpacity onPress={clearLogs}>
            <Text style={styles.link}>Clear</Text>
          </TouchableOpacity>
        </View>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#12141a' },
  scroll: { padding: 16, paddingBottom: 40 },
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
  },
  cardSel: { borderColor: '#4a7ab0', backgroundColor: '#1a2228' },
  cardTitle: { color: '#e4e7ec', fontSize: 16, fontWeight: '600' },
  cardHint: { color: '#8b949e', fontSize: 12, marginTop: 4 },
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
  btnDanger: {
    marginTop: 12,
    backgroundColor: '#3a2226',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6b4548',
  },
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
  deviceName: { color: '#e4e7ec', fontSize: 15, fontWeight: '600' },
  deviceId: { color: '#8b949e', fontSize: 11, marginTop: 2 },
  box: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#16181f',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2d323c',
  },
  mono: { color: '#c9d1d9', fontSize: 12 },
  metric: { color: '#9ab6d4', fontSize: 16, marginTop: 8 },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  smallBtn: {
    flex: 1,
    backgroundColor: '#2a3440',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
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
});
