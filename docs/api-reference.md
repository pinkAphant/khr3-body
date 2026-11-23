# `@khr3/body` API and Configuration Guide

`@khr3/body` provides the SI first-person and third-person player body constants (`BODY_SI`, `BODY_MOVE_TUNE`, `BODY_SOCKET_IDS`) plus the thin React Three Fiber glue components (`<KhrBody>` and `<HeldItem>` under `@khr3/body/react`) layered directly on `@pinkaphant/ecctrl` `<Ecctrl>`.

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
  type BodySiConstants,
  type BodySocketId,
} from "@khr3/body";

import {
  KhrBody,
  HeldItem,
  createHeldItemController,
  stepCameraSync,
  type KhrBodyHandle,
  type KhrBodyProps,
  type HeldItemController,
  type HeldItemProps,
} from "@khr3/body/react";
```

---

## Package Exports

| Path | Main exports |
| --- | --- |
| `@khr3/body` | Zero-dependency SI body dimensions (`BODY_SI`, `BODY_MOVE_TUNE`, `BODY_SOCKET_IDS`, `bodyRestCenterY`, `bodyStandingHeight`, `bodyEyeOffsetY`, `bodySpawnPosition`) |
| `@khr3/body/react` | `<KhrBody>`, `<HeldItem>`, `createHeldItemController`, `stepCameraSync`, `KhrBodyHandle` |

---

## Frame & Stepping Contract

1. Mount `<KhrBody>` inside `@khr3/core` `<PhysicsWorld>` (or `<Physics paused>` stepped by `@pinkaphant/ecctrl/time` `<TimeControl>`).
2. Every `useFrame` inside `@khr3/body/react` runs at default priority `0` (`BodyInput` $\rightarrow$ `PhysicsWorld` $\rightarrow$ `Ecctrl` $\rightarrow$ `BodyCameraSync` $\rightarrow$ `ViewModelSync`), so R3F's automatic render loop is never disabled.
3. `<HeldItem>` mounts any `@khr3/core` `KhrAssetBundle` into `Socket_Hand_R`, `Socket_Hand_L`, `Socket_Head`, or `Socket_Back`, aligning `grip_primary` to the socket origin and driving articulated parts (`slide`, `bolt`, `pump`, `trigger`) along their authored joint axes and limits with zero extra Rapier impulse joints.
