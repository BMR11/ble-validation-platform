# Profile versioning (remote-profile)

## Concepts

- **`profileId`** — Stable identifier (for example `heart-rate-monitor`). Matches the `id` field inside the BLE profile JSON document. The peripheral asks the server for “latest” using this id.
- **Version label** — String stored per row (for example `"1"`, `"2"`). This is **admin metadata** for ordering published snapshots; it may align with the JSON’s own `version` field but they are not automatically coupled.
- **`status`** — `draft` or `published`. Only **published** rows are visible in the **public catalog** and eligible for `GET .../latest`.
- **`document`** — The full profile JSON (same schema as [`profiles/local/`](../profiles/local/) files), including optional `valueGenerator` keys expanded in the app via `applyValueGenerators`.

## “Latest published”

When a client calls `GET /api/profiles/:profileId/latest`, the server:

1. Collects all versions with `status === "published"`.
2. Picks the greatest version label using a simple numeric-friendly comparator (splits on `.` and `-`, compares numeric segments when possible).
3. Returns that row’s `document`.

Draft rows never satisfy `latest`.

## Seeded examples

The first server run copies [`remote-profile/server/seed/initial-store.json`](../remote-profile/server/seed/initial-store.json) into `remote-profile/server/data/store.json` (gitignored). Seeds include:

- **`heart-rate-monitor`** — `1` and `2` published (v2 adds a vendor extension service), plus a `3` **draft** for UI demonstration.
- **`nordic-lbs`** — `1` published (LBS only), `2` published (adds battery service).

## Local profiles

Files under `profiles/local/` are **not** versioned in the admin sense: each file is a single snapshot bundled into the app. Use remote-profile when you want multiple historical rows and publish/draft workflow.

## Future: firmware-driven sync

Not implemented. See [remote-profiles.md](./remote-profiles.md) and [remote-profile/README.md](../remote-profile/README.md) for how firmware and profile evolution could connect later.
