# Documentation

This page is the navigation map for the BLE validation platform docs.

Use it to find the right level of detail without reading every file in order.

## Start here

- [Repository README](../README.md) — project overview, problem statement, setup, demo flow, and roadmap.
- [Demo flows](./demo-flows.md) — end-to-end flows for Heart Rate, Nordic LBS, and optional error-state testing.
- [Architecture](./architecture.md) — high-level view of the central app, peripheral app, profile engine, and BLE interaction.

## Understand profiles

- [Profile schema quick reference](./profile-schema.md) — repo-level summary of profile fields and `valueGenerator` usage.
- [Full profile schema](../peripheral-app/src/profiles/docs/PROFILE_SCHEMA.md) — detailed field reference for authoring and engine behavior.
- [Authoring guide](../peripheral-app/src/profiles/docs/AUTHORING_GUIDE.md) — practical guide for writing profiles.
- [Profile engine guide](../peripheral-app/src/profiles/docs/ENGINE_GUIDE.md) — how profiles are executed by the engine.
- [Profiles system plan](../peripheral-app/src/profiles/docs/profiles-system-plan.md) — longer design notes and system context.
- [Example app profile README](../peripheral-app/src/profiles/docs/EXAMPLE_APP_README.md) — example-app oriented profile usage notes.

## Run the apps

- [Central app README](../central-app/README.md) — central app setup, iOS notes, Android run steps, and tests.
- [Peripheral app README](../peripheral-app/README.md) — peripheral app setup, environment configuration, release APK notes, and automation hooks.
- [Remote profile README](../remote-profile/README.md) — remote profile service setup and LAN demo workflow.
- [Automation README](../automation/README.md) — agent-device and ADB-based end-to-end automation workflows.

## Remote profiles

- [Remote profiles](./remote-profiles.md) — local vs remote profile concepts, environment variables, and peripheral integration.
- [Remote profile API](./remote-profile-api.md) — HTTP API reference for public reads and admin operations.
- [Profile versioning](./profile-versioning.md) — draft, published, latest, and seeded version behavior.
- [Remote profile samples](../profiles/remote/README.md) — purpose of the `profiles/remote/` folder.

## Reference

- [Local BLE peripheral module](../local_modules/rn-ble-peripheral-module/README.md) — short note on the vendored native module.
- [Local profiles](../profiles/local/) — bundled demo profiles used by the peripheral app.
- [Remote profile server seed data](../remote-profile/server/seed/) — seeded profiles used by the remote profile demo.

## Suggested reading paths

New to the project:

1. [Repository README](../README.md)
2. [Demo flows](./demo-flows.md)
3. [Architecture](./architecture.md)

Authoring or changing profiles:

1. [Profile schema quick reference](./profile-schema.md)
2. [Full profile schema](../peripheral-app/src/profiles/docs/PROFILE_SCHEMA.md)
3. [Authoring guide](../peripheral-app/src/profiles/docs/AUTHORING_GUIDE.md)

Working with remote profiles:

1. [Remote profiles](./remote-profiles.md)
2. [Remote profile README](../remote-profile/README.md)
3. [Remote profile API](./remote-profile-api.md)
4. [Profile versioning](./profile-versioning.md)

Digging into internals:

1. [Architecture](./architecture.md)
2. [Profile engine guide](../peripheral-app/src/profiles/docs/ENGINE_GUIDE.md)
3. [Profiles system plan](../peripheral-app/src/profiles/docs/profiles-system-plan.md)
