import { Platform } from 'react-native';
import {
  REMOTE_PROFILE_LAN_HOST as ENV_LAN,
  REMOTE_PROFILE_TUNNEL_BASE as ENV_TUNNEL,
} from '@env';

/**
 * Resolved from `peripheral-app/.env` (see `.env.example`). Do not put real IPs in source files.
 *
 * - **`.env`**: `REMOTE_PROFILE_LAN_HOST` = dev machine Wi‑Fi IPv4 when using a **physical** phone on the same LAN.
 * - **`.env`**: `REMOTE_PROFILE_TUNNEL_BASE` = optional `https://…` tunnel origin (wins over LAN + port 4050).
 * - Leave LAN empty for **Android emulator** (`10.0.2.2`) or **iOS Simulator** (`127.0.0.1`).
 */
export const PHYSICAL_DEVICE_LAN_HOST = (ENV_LAN ?? '').trim();

/**
 * Optional tunnel origin from `.env` — same semantics as documented on {@link PHYSICAL_DEVICE_LAN_HOST}.
 */
export const REMOTE_PROFILE_TUNNEL_BASE = (ENV_TUNNEL ?? '').trim();

function trimSlash(s: string): string {
  return s.replace(/\/$/, '');
}

/**
 * Base URL of the remote-profile API as reached from this app (no trailing slash).
 *
 * Configure via `peripheral-app/.env` — see `.env.example` and docs/remote-profiles.md.
 *
 * Android **release** builds need cleartext allowed for `http://` LAN URLs — see
 * `android/app/src/main/AndroidManifest.xml` (`usesCleartextTraffic`).
 */
export const REMOTE_PROFILE_API_BASE: string = (() => {
  const tunnel = REMOTE_PROFILE_TUNNEL_BASE;
  if (tunnel) {
    return trimSlash(tunnel);
  }
  const host = PHYSICAL_DEVICE_LAN_HOST;
  if (host) {
    return `http://${host}:4050`;
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:4050';
  }
  return 'http://127.0.0.1:4050';
})();
