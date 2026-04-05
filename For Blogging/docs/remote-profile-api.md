# Remote-profile HTTP API

Base URL: `http://<host>:4050` by default (`PORT` env overrides).

All JSON bodies use `Content-Type: application/json`.

## Authentication (demo)

- **POST** `/api/auth/login` — body `{ "email": string, "password": string }` → `{ "token": string, "email": string }`.
- For protected routes, send header `Authorization: Bearer <token>`.
- Tokens are stored **in memory** on the server only; restarting the server invalidates sessions.

Seeded account (see [remote-profile/README.md](../remote-profile/README.md)):

- Email: `demo@example.com`
- Password: `demo123`

## Public reads (peripheral / unauthenticated)

These endpoints are intentionally open for local demos so the React Native app does not need to embed credentials.

### GET `/api/profiles`

Without `Authorization`: returns a **catalog** of profiles that have at least one **published** version:

```json
{
  "profiles": [
    {
      "profileId": "heart-rate-monitor",
      "name": "Heart Rate Monitor",
      "category": "medical",
      "latestPublishedVersion": "2",
      "updatedAt": "2026-03-28T12:00:00.000Z"
    }
  ]
}
```

With valid `Authorization`: returns **full** profile records (all versions, including drafts) for the admin UI.

### GET `/api/profiles/:profileId/latest`

Returns the **latest published** version by internal version ordering (see [profile-versioning.md](./profile-versioning.md)):

```json
{
  "profileId": "heart-rate-monitor",
  "version": "2",
  "updatedAt": "2026-03-28T12:00:00.000Z",
  "profile": { "...": "BleProfile JSON document" }
}
```

Errors: `404` if the profile or no published version exists.

## Protected (admin)

### GET `/api/profiles/:profileId`

Full `StoredProfile` including every version row and embedded `document` objects.

### GET `/api/profiles/:profileId/versions`

Lightweight list of versions (no full documents).

### POST `/api/profiles`

Create a new `profileId` with an initial version.

Body:

- `profileId` (string, required)
- `name` (string, required)
- `category` (string, optional, default `general`)
- `notes` (string, optional)
- `document` (object, required) — BLE profile JSON
- `version` (string, optional, default `"1"`)
- `status` (`"draft"` | `"published"`, optional, default `"draft"`)

### PUT `/api/profiles/:profileId/:version`

Update one version. Body fields (all optional except you must send something useful):

- `document` — full profile JSON object
- `status` — `draft` | `published`
- `changelog`, `name`, `category`, `notes`, `metadata`

### POST `/api/profiles/:profileId/:version/clone`

Body: `{ "targetVersion": string, "changelog"?: string }` — copies the source version into a new **draft** row.

### DELETE `/api/profiles/:profileId/:version`

Removes one version. If it was the last version, the profile is removed.

### DELETE `/api/profiles/:profileId`

Deletes the profile and **all** versions.

## Health

### GET `/health`

`{ "ok": true, "service": "remote-profile" }`
