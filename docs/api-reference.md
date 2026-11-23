# `@khr3/body` API and Configuration Guide

`@khr3/body` provides the SI first-person and third-person player body constants (`BODY_SI`, `BODY_MOVE_TUNE`, `BODY_SOCKET_IDS`) plus the React Three Fiber glue components (`<KhrBody>` and `<HeldItem>` under `@khr3/body/react`) layered directly on `@pinkaphant/ecctrl` (`^2.0.4-beta.3`) and `@khr3/core`.

---

## Import Paths

```ts
import {
  BODY_SI,
  BODY_MOVE_TUNE,
  BODY_SOCKET_IDS,
  bodyRestCenterY,
  bodyStandingHeight,
  bodyEyeOffsetY,
  bodySpawnPosition,
  stepCameraSync,
  withExcludeCharacterRay,
  type BodySiConstants,
  type BodySocketId,
} from "@khr3/body";

import {
  KhrBody,
  HeldItem,
  type KhrBodyHandle,
  type KhrBodyProps,
  type HeldItemHandle,
  type HeldItemProps,
} from "@khr3/body/react";
```

---

## Package Exports

| Path | Main exports |
| --- | --- |
| `@khr3/body` | Zero-dependency SI body dimensions & helpers (`BODY_SI`, `BODY_MOVE_TUNE`, `BODY_SOCKET_IDS`, `bodyRestCenterY`, `bodyStandingHeight`, `bodyEyeOffsetY`, `bodySpawnPosition`, `stepCameraSync`, `withExcludeCharacterRay`) |
| `@khr3/body/react` | `<KhrBody>`, `<HeldItem>`, `KhrBodyHandle`, `KhrBodyProps`, `HeldItemHandle`, `HeldItemProps` (plus re-exports of `@khr3/body`) |

---

## Frame & Stepping Contract

1. Mount `<KhrBody>` inside `@khr3/core` `<PhysicsWorld>` (or `<Physics paused>` stepped by `@pinkaphant/ecctrl/time` `<TimeControl>`).
2. Every `useFrame` inside `@khr3/body/react` runs at default priority `0` (`<BodyInput>` mounted before `<Ecctrl>`, `<BodyPostEcctrlSync>` mounted after `<Ecctrl>`), so R3F's automatic render loop is never disabled and input arrives on the current frame.
3. `<KhrBody>` sets `userData.ecctrl.excludeVehicleRay = true` on the character capsule (preserving caller `userData`), while `<HeldItem>` mounts held-item colliders on a kinematic sensor `RigidBody` with `userData.ecctrl.excludeCharacterRay = true` and registers articulated joints into `@khr3/core` `JointRegistryContext` with zero Rapier impulse joints.
