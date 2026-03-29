declare module '@env' {
  /** Wi‑Fi IPv4 of the dev machine for physical device + same LAN (no `http://`, no port). */
  export const REMOTE_PROFILE_LAN_HOST: string | undefined;
  /** Optional public `https://` origin for tunnels (ngrok / loca.lt); no trailing slash. */
  export const REMOTE_PROFILE_TUNNEL_BASE: string | undefined;
}
