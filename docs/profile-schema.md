# Profile schema

Profiles are JSON documents consumed by the peripheral **`ProfileEngine`** (see `peripheral-app/src/profiles/types.ts` for the full TypeScript model).

## Top-level fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Stable identifier (e.g. `heart-rate-monitor`). |
| `name` | yes | Human-readable name. |
| `description` | no | Shown in the peripheral UI. |
| `advertising.localName` | yes | GAP name used when advertising. |
| `advertising.deviceName` | no | Optional adapter/device name where supported. |
| `deviceInfo` | no | Shorthand for standard **Device Information Service** (0x180A). |
| `stateMachine` | no | Idle/active/error style flows; transitions on subscribe, unsubscribe, write, timer, manual. |
| `services` | yes | List of GATT services and characteristics. |

## Characteristics

Each characteristic generally includes:

- `uuid` — 16-bit short form (e.g. `2A37`) or 128-bit string.
- `properties` — e.g. `read`, `write`, `notify`, `writeWithoutResponse`.
- `permissions` — `readable`, `writeable`, …
- `value` — `type`: `uint8` \| `uint8Array` \| `string` \| `hex` \| `base64`, plus `initial`.
- `simulation` — optional auto value generator (`randomWalk`, `decrement`, …) with `encoding`.
- `stateOverrides` — per–state-machine-state overrides for simulation, read/write behavior, static values.
- `ui` — optional peripheral UI hints (`stepper`, `slider`, `toggle`, `readonly`).
- `onWrite` — `log` or `updateState` with optional `decode` (`uint8`, `boolean`, `string`).

## `valueGenerator` (this repo)

In `profiles/heart-rate.json`, some characteristics use:

```json
"valueGenerator": "heartRateMeasurement"
```

At load time, `peripheral-app/src/profiles/applyValueGenerators.ts` replaces this with the full `simulation` and `stateOverrides` blocks expected by the engine.

### Registered generators

| Key | Purpose |
|-----|---------|
| `heartRateMeasurement` | HR notify payload (`uint8Array` with flags prefix) + active/error state behavior. |
| `batteryDecrement` | Battery % notify simulation when the state machine is active. |

To add a new generator:

1. Implement a factory in `VALUE_GENERATOR_REGISTRY` inside `applyValueGenerators.ts`.
2. Reference the key from JSON.

Nordic LBS behavior in `profiles/nordic-lbs.json` is expressed directly in JSON (`onWrite`, static values) without generators, keeping that profile easy to read.

## Files

- `profiles/heart-rate.json` — Heart Rate (0x180D), Battery (0x180F), DIS, state machine.
- `profiles/nordic-lbs.json` — Nordic LED Button service UUIDs, battery service, state machine.
