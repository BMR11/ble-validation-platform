# Profile schema

Profiles are JSON documents consumed by the peripheral **`ProfileEngine`** (see `peripheral-app/src/profiles/types.ts` for the full TypeScript model).

## Top-level fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Stable identifier (e.g. `heart-rate-monitor`). |
| `name` | yes | Human-readable name. |
| `version` | no | Profile schema version string (e.g. `"1.0"`). |
| `description` | no | Shown in the peripheral UI. |
| `advertising.localName` | yes | GAP name used when advertising. |
| `advertising.deviceName` | no | Optional adapter/device name where supported. |
| `advertising.serviceUUIDs` | no | UUIDs considered for advertising. When omitted, derived from `services` in array order (+ DIS if `deviceInfo` is present). The engine advertises only the first UUID in that list. |
| `deviceInfo` | no | Shorthand for standard **Device Information Service** (0x180A). |
| `stateMachine` | no | Idle/active/error style flows; transitions on subscribe, unsubscribe, write, timer, manual. |
| `services` | yes | List of GATT services and characteristics. |

## Order

Array order is stored as written and used by the engine as follows. The remote-profile visual builder shows the same rules on the edit page.

| List | What order changes |
|------|--------------------|
| `services` | GATT registration order. The first service UUID is what gets advertised when `advertising.serviceUUIDs` is omitted. |
| Characteristics inside a service | Registration and display order. Centrals look up a characteristic by UUID. |
| `stateMachine.states` | Key order in the JSON object. The running start state is `stateMachine.initial`, not the first key. |
| `transitions` on a state | Match order. The first transition whose trigger matches is the one that runs. |

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

In `profiles/local/heart-rate.json`, some characteristics use:

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

Nordic LBS behavior in `profiles/local/nordic-lbs.json` is expressed directly in JSON (`onWrite`, static values) without generators, keeping that profile easy to read.

## Files

- `profiles/local/heart-rate.json` — Heart Rate (0x180D), Battery (0x180F), DIS, state machine.
- `profiles/local/nordic-lbs.json` — Nordic LED Button service UUIDs, battery service, state machine.

The same JSON shape can be stored in **remote-profile** with multiple published versions; the peripheral still runs it through `applyValueGenerators` + `ProfileEngine`. See [remote-profiles.md](./remote-profiles.md).
