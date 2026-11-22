# `@khr3/body` Spec: the first-person body

Status: **spec + SI constants only**. Nothing React-side is built yet. Not published.

## 1. What it is

A first-person (and third-person) player body. It is `@pinkaphant/ecctrl` `<Ecctrl>` used exactly as designed, plus three thin pieces of glue:

1. A camera rig.
2. A view-model slot (hands plus a held item).
3. Sockets that hold any `@khr3/core` bundle.

That's the whole package. It is not a second character controller.

| Owns | Does not own |
| --- | --- |
| SI body dimensions (`src/index.ts`) | Ground detection, float spring, gravity scaling (ecctrl owns these) |
| Camera follow and view-model sync after the physics step | Physics stepping (`<PhysicsWorld>` owns this) |
| Hand/head/back socket frames for held `.glb` items | Item cycle logic (`@khr3/launchers` owns this) |
| Input mapping to a partial `setMovement` | Gameplay ECS, inventory, NPC brains (the game layer owns these) |

Peers: `react`, `three`, `@react-three/fiber`, `@react-three/rapier`, `@khr3/core`, `@pinkaphant/ecctrl` `^2.0.4-beta.3`. Optional: `@khr3/launchers`, `@khr3/assets`.

## 2. Where it comes from (migration source)

`~/Documents/GitHub/r3f-modular-npc/src/range/` plus `npc/weaponMount.ts` and `npc/fingerPoser.ts`.

| Source file | Fate |
| --- | --- |
| `RangePlayer.tsx` (SI capsule, eye height, `<Ecctrl>` props) | **Port.** The constants are already in `src/index.ts`. |
| `rangePostStepSync.ts` `PlayerPostStepSync` | **Port, minus the gravity hack** (the `gravityScale` held at 0 until `linvel.y > 2`). |
| `rangePostStepSync.ts` `RangeWarmupGate` (`useFrame(..., 2)`) | **Do not ship.** A positive priority turns off R3F's automatic render. A library must not do that silently. |
| `rangeSubstepSync.ts` `EcctrlSubstepSync` | **Delete.** It re-implements ecctrl's ground cast, float spring, drag and gravity scale in `useBeforePhysicsStep`. That is a parallel physics layer, which INTENT forbids. |
| `FpsHands.tsx`, `WeaponRig.tsx`, `weaponMount.ts`, `fingerPoser.ts` | **Port, with neutral names.** Use `HeldItem`, not `Weapon`. |
| `weaponLoader.ts` (raw `GLTFLoader`, relative `/assets/weapons/...` URLs) | **Replace** with `useKhrGlb(vault.url(key), { extractRole, isSocketNode })`. |
| `ballistics.ts`, `rangeStoreCore.ts`, `useRangeTargets.ts`, HUD | **Stay in the game.** They are not body concerns. |

### Why the substep hack existed

`ShootingRangeScene.tsx` uses a bare `<Physics>` with its default fixed `1/60` step. ecctrl's `useFrame` runs once per render frame and scales by `frameRateCorrection = 60 * world.timestep`. It assumes **one variable-length step per frame**, which is what `TimeControl` and `@khr3/core` `<PhysicsWorld timeStep="vary">` provide.

On a 120 Hz display, a fixed-step world steps 0, 1 or 2 times per frame, so ecctrl's impulses land unevenly and the capsule bobs. The substep hack papered over that.

**Rule:** `@khr3/body` must be mounted inside `<PhysicsWorld>`. The acceptance test in §5 must pass with no extra impulses.

## 3. Frame order (useFrame and imperative refs)

These are facts from the source. Every relevant `useFrame` uses **default priority 0**:
- `PhysicsWorld` `WorldStepper` (`src/PhysicsWorld.tsx:28`)
- `Ecctrl` (`character/Ecctrl.tsx:957`)
- `EcctrlVehicle` (`:933`)
- `ShapeCastWheel` (`:918`)
- `TimeControl` (`:27`)

R3F runs callbacks of equal priority in subscription order, which follows mount order. So **mount order is the frame order**, and the body must make it explicit.

| # | Component (mount order) | Reads | Writes |
| --- | --- | --- | --- |
| 1 | `<BodyInput>` | keyboard/pad/touch | `ecctrl.setMovement({...partial})`. Only changed fields; zero allocation (reuse one object). |
| 2 | `<PhysicsWorld>` stepper | `delta` | `world.timestep = dt; step(dt)`. Joints step first with the same `dt`. |
| 3 | `<Ecctrl>` | Rapier body | impulses for the next step, and its live handle fields (`currPos`, `currQuat`, `isOnGround`, …) |
| 4 | `<BodyCameraSync>` | `handle.currPos` / `currQuat` (live `Vector3`s, **never cloned**) | `cameraControls.moveTo(x, y + EYE_OFFSET_Y, z, smooth)`, `update(0)` |
| 5 | `<ViewModelSync>` | the camera | copy the view-model group's `position`/`quaternion` from the camera |

Imperative-ref rules (from the ecctrl api-reference):
- Handle fields are **live objects**. Read them inside `useFrame`; clone only for a persistent snapshot.
- Control goes only through setters (`setMovement`, `setLockForward`, `setForwardDir`). Never write handle fields.
- Callbacks passed as props are mirrored into refs (`cbRef.current = cb`), so effects never re-subscribe.
- Module-scope scratch `Vector3`/`Quaternion` objects only. **Zero per-frame heap allocation.**
- To exclude the body's own held-item colliders from ecctrl casts, set `userData.ecctrl.excludeCharacterRay` on the **parent RigidBody** (ecctrl reads `collider.parent()?.userData`).

## 4. Public surface (target)

```ts
export const BODY_SI: BodySiConstants;            // src/index.ts (exists)
export function bodyRestCenterY(b?: BodySiConstants): number; // exists
export function bodyEyeOffsetY(b?: BodySiConstants): number;  // exists

// planned (React):
export function KhrBody(props: KhrBodyProps): JSX.Element;    // <Ecctrl> + camera + view model
export interface KhrBodyHandle { ecctrl: EcctrlHandle | null; socket(id: BodySocketId): THREE.Object3D | null; }
export type BodySocketId = "Socket_Hand_R" | "Socket_Hand_L" | "Socket_Head" | "Socket_Back";
export function HeldItem(props: { bundle: KhrAssetBundle; socket: BodySocketId }): JSX.Element;
```

Seat handoff with `<KhrVehicle>` follows GAME_ENGINE_BLUEPRINT §3: `enable={false}` on enter; on exit, respawn at the CoM-corrected exit socket and seed `currLinVel`.

## 5. Done means these tests fail before and pass after

1. **SI height:** capsule `2*0.5 + 2*0.3 + float 0.15 = 1.75 m` and eye height `1.62 m` (in `src/body.test.ts`).
2. **Grounding without hacks:** headless Rapier under `<PhysicsWorld>` with dt of 1/60, 1/120 and 1/144. The body settles to `BODY_SI.restCenterY ± 5 mm` within 1 s, with no `useBeforePhysicsStep` in the package (enforced by a source grep).
3. **Zero allocation:** 600 frames of `BodyCameraSync` add no measurable heap growth.
4. **Held item:** a `@khr3/core` pistol bundle mounts at `Socket_Hand_R`, `setRoleTarget("slide", -0.055)` clamps at its authored limit, and `world.impulseJoints.len() === 0`.
5. **No auto-render override:** no `useFrame(…, n)` with `n > 0` anywhere in `src/`.
