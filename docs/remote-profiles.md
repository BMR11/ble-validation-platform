# Remote (server-driven) profiles

## What this is

BLE device behavior in this repo is defined by **JSON profiles** (GATT layout, advertising, optional state machine, UI hints). Those documents can be:

1. **Local** — bundled JSON under [`profiles/local/`](../profiles/local/), loaded at build time by the peripheral app (default, works offline).
2. **Remote** — stored in the [**remote-profile**](../remote-profile/) admin service, versioned, and fetched at runtime by the peripheral over HTTP.

Remote profiles demonstrate **central management**: you can publish a new version (for example after a firmware or spec change), bump a version label, and have the peripheral **fetch the latest published** definition by stable `profileId`.

## What is *not* implemented

**Firmware sync** (pushing binaries, OTA, or automatic profile generation from firmware) is **not** part of this demo. It is described as a future direction in [remote-profile/README.md](../remote-profile/README.md) and [profile-versioning.md](./profile-versioning.md).

## Flow

1. Run **remote-profile** server (see [remote-profile/README.md](../remote-profile/README.md)).
2. Edit and **publish** versions in the web admin (or rely on seeded data).
3. In **peripheral-app**, choose **Profile source → Remote**, tap **Fetch remote profiles**, then select a row. The app calls `GET /api/profiles/:profileId/latest` and passes the JSON through the same `applyValueGenerators` + `ProfileEngine` path as local files.

## Configuration (environment variables — no IPs in Git)

**Do not commit** machine-specific hosts, tunnel URLs, or tokens. Use **`.env`** files (gitignored) copied from **`.env.example`**.

### `peripheral-app`

1. `cp .env.example .env` inside [`peripheral-app/`](../peripheral-app/).
2. Set **`REMOTE_PROFILE_LAN_HOST`** to your dev computer’s **Wi‑Fi IPv4** when testing on a **physical phone** on the same LAN (e.g. Mac: `ipconfig getifaddr en0`). Leave empty for the Android emulator / iOS Simulator.
3. Optionally set **`REMOTE_PROFILE_TUNNEL_BASE`** to a public `https://…` origin (ngrok, loca.lt, etc.) for cellular / off-LAN.
4. Restart Metro after editing **`.env`** (Metro does not read **`.env.example`**). If the app still shows the old API URL, start the bundler with a cache reset: `yarn start --reset-cache` or `npm start -- --reset-cache`.

[`remoteProfileApiBase.ts`](../peripheral-app/src/config/remoteProfileApiBase.ts) only **reads** those values (via [`react-native-dotenv`](https://github.com/goatandsheep/react-native-dotenv)); it should not contain real IPs.

### `remote-profile/server` (optional)

1. `cp .env.example .env` in [`remote-profile/server/`](../remote-profile/server/).
2. Defaults: `PORT=4050`, `HOST=0.0.0.0`. Adjust if a port is busy.

### `remote-profile/client` (optional)

Only if you build the admin UI with a fixed API origin: copy **`client/.env.example`** to **`.env`** and set **`VITE_API_URL`** when not using the dev proxy.

### Demo login (not production secrets)

The seeded **`demo@example.com` / `demo123`** account exists only for this demo admin UI. It is documented publicly and must not be reused as real security.

### Demo: Using remote profile for Heart Rate Monitor Service

https://github.com/user-attachments/assets/9427c3cb-7782-45fd-9aa3-555825ccd42c


## Related docs

- [remote-profile-api.md](./remote-profile-api.md) — HTTP API reference.
- [profile-versioning.md](./profile-versioning.md) — draft vs published and “latest” rules.
