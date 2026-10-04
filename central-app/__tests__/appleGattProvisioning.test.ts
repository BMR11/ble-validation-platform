import {
  appleAliasUuid,
  appleProvisioningCatalogJson,
  applePublishedServiceUuid,
  isAppleAliasForShort,
  sameGattUuid,
  sigAssignedShort,
} from '../../shared/appleGattProvisioning';
import { gattAccessAttempts, resolveDiscoveredPair } from '../src/discoveredGatt';

const BATTERY_SIG = '0000180f-0000-1000-8000-00805f9b34fb';
const DIS_SIG = '0000180a-0000-1000-8000-00805f9b34fb';
const BATTERY_ALIAS = '0000180f-0000-1000-8000-b1e000000000';
const DIS_ALIAS = '0000180a-0000-1000-8000-b1e000000000';
const LEVEL = '00002a19-0000-1000-8000-00805f9b34fb';
const MANUFACTURER = '00002a29-0000-1000-8000-00805f9b34fb';

describe('apple GATT provisioning', () => {
  test('rewrites only system-owned SIG services', () => {
    expect(applePublishedServiceUuid('180F')).toBe(BATTERY_ALIAS);
    expect(applePublishedServiceUuid(BATTERY_SIG.toUpperCase())).toBe(BATTERY_ALIAS);
    expect(applePublishedServiceUuid('180A')).toBe(DIS_ALIAS);
    expect(applePublishedServiceUuid(DIS_SIG)).toBe(DIS_ALIAS);
    expect(applePublishedServiceUuid('0000180d-0000-1000-8000-00805f9b34fb')).toBeNull();
    expect(applePublishedServiceUuid(BATTERY_ALIAS)).toBeNull();
    expect(sigAssignedShort(BATTERY_ALIAS)).toBeNull();
    expect(sigAssignedShort('2A19')).toBe('2a19');
  });

  test('catalog JSON matches the native key order and alias spelling', () => {
    expect(
      appleProvisioningCatalogJson({
        '180F': '0000180F-0000-1000-8000-B1E000000000',
        '180A': '0000180A-0000-1000-8000-B1E000000000',
      })
    ).toBe(
      '{"180A":"0000180A-0000-1000-8000-B1E000000000","180F":"0000180F-0000-1000-8000-B1E000000000"}'
    );
    expect(isAppleAliasForShort(appleAliasUuid('180F'), '180f')).toBe(true);
    expect(sameGattUuid('180F', BATTERY_SIG)).toBe(true);
    expect(sameGattUuid(BATTERY_ALIAS, '180F')).toBe(false);
  });

  test('prefers the Apple alias over the system Battery and DIS services', () => {
    const info = {
      services: [{ uuid: '180F' }, { uuid: BATTERY_ALIAS }, { uuid: '180A' }, { uuid: DIS_ALIAS }],
      characteristics: [
        { service: '180F', characteristic: '2A19' },
        { service: BATTERY_ALIAS, characteristic: LEVEL },
        { service: '180A', characteristic: MANUFACTURER },
        { service: DIS_ALIAS, characteristic: MANUFACTURER },
      ],
    };
    expect(resolveDiscoveredPair(info, '180F', '2A19')).toEqual({
      service: BATTERY_ALIAS,
      characteristic: LEVEL,
    });
    expect(resolveDiscoveredPair(info, '180A', '2A29')).toEqual({
      service: DIS_ALIAS,
      characteristic: MANUFACTURER,
    });
    const attempts = gattAccessAttempts(info, '180F', '2A19');
    expect(attempts.every((pair) => pair.service === BATTERY_ALIAS)).toBe(true);
  });

  test('uses the SIG service when the peripheral is not an Apple host', () => {
    const info = {
      services: [{ uuid: BATTERY_SIG }],
      characteristics: [{ service: BATTERY_SIG, characteristic: LEVEL }],
    };
    expect(resolveDiscoveredPair(info, '180F', '2A19')).toEqual({
      service: BATTERY_SIG,
      characteristic: LEVEL,
    });
  });
});
