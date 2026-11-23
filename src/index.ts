/**
 * @khr3/body: SI first-person and third-person body dimensions and zero-allocation camera helpers
 * for `@pinkaphant/ecctrl` `<Ecctrl>` and `<EcctrlCameraControls>`.
 */

export interface BodySiConstants {
  /** `<Ecctrl capsuleHalfHeight>` in metres. */
  readonly capsuleHalfHeight: number;
  /** `<Ecctrl capsuleRadius>` in metres. */
  readonly capsuleRadius: number;
  /** `<Ecctrl floatHeight>` in metres. */
  readonly floatHeight: number;
  /** Eye height above the floor in metres. */
  readonly eyeHeight: number;
  /** Camera dolly distance in first person (metres). */
  readonly firstPersonDistance: number;
  /** Camera dolly distance in third person (metres). */
  readonly thirdPersonDistance: number;
}

/** 1.75 m standing adult: 2 * 0.50 + 2 * 0.30 + 0.15. */
export const BODY_SI: BodySiConstants = Object.freeze({
  capsuleHalfHeight: 0.5,
  capsuleRadius: 0.3,
  floatHeight: 0.15,
  eyeHeight: 1.62,
  firstPersonDistance: 0.02,
  thirdPersonDistance: 3.2,
});

/** Ecctrl movement tuning used by the range player (named, not buried). */
export const BODY_MOVE_TUNE = Object.freeze({
  maxWalkVel: 2.5,
  maxRunVel: 9.0,
  accDeltaTime: 0.96,
  decDeltaTime: 0.9,
  slideGripFactor: 1.0,
  moveImpulsePointOffset: 0,
  airDragFactor: 0.85,
  enableToggleRun: false,
} as const);

export type BodySocketId = "Socket_Hand_R" | "Socket_Hand_L" | "Socket_Head" | "Socket_Back";

export const BODY_SOCKET_IDS: readonly BodySocketId[] = Object.freeze([
  "Socket_Hand_R",
  "Socket_Hand_L",
  "Socket_Head",
  "Socket_Back",
]);

function assertBody(b: BodySiConstants): void {
  for (const [k, v] of Object.entries(b)) {
    if (!(typeof v === "number" && Number.isFinite(v) && v >= 0)) {
      throw new RangeError(`@khr3/body: ${k} must be a finite non-negative number, got ${String(v)}`);
    }
  }
  if (!(b.capsuleRadius > 0)) throw new RangeError("@khr3/body: capsuleRadius must be > 0");
}

/** Rigid-body centre height when standing at rest on flat ground. */
export function bodyRestCenterY(b: BodySiConstants = BODY_SI): number {
  assertBody(b);
  return b.floatHeight + b.capsuleRadius + b.capsuleHalfHeight;
}

/** Total standing height from floor to the top of the capsule. */
export function bodyStandingHeight(b: BodySiConstants = BODY_SI): number {
  return bodyRestCenterY(b) + b.capsuleHalfHeight + b.capsuleRadius;
}

/** Camera target offset above the rigid-body centre. */
export function bodyEyeOffsetY(b: BodySiConstants = BODY_SI): number {
  const off = b.eyeHeight - bodyRestCenterY(b);
  if (!(off > 0)) throw new RangeError("@khr3/body: eyeHeight must sit above the body centre");
  return off;
}

/** Spawn position whose feet rest on `floorY`. */
export function bodySpawnPosition(x: number, floorY: number, z: number, b: BodySiConstants = BODY_SI): [number, number, number] {
  return [x, floorY + bodyRestCenterY(b), z];
}

/**
 * Merges `ecctrl.excludeCharacterRay: true` into a RigidBody `userData` object for held-item colliders
 * so `@pinkaphant/ecctrl` ground casts ignore held items (`collider.parent()?.userData`).
 */
export function withExcludeCharacterRay(userData?: Record<string, unknown>): Record<string, unknown> {
  const prevEcctrl = (userData?.ecctrl as Record<string, unknown> | undefined) ?? {};
  return {
    ...(userData ?? {}),
    ecctrl: {
      ...prevEcctrl,
      excludeCharacterRay: true,
    },
  };
}

/** Zero-allocation camera step sync from live handle position (and optional local Y axis) to camera controls at eye height. */
export function stepCameraSync(
  controls: { moveTo?: (x: number, y: number, z: number, smooth: boolean) => unknown; update?: (dt: number) => unknown } | null,
  pos: { x: number; y: number; z: number },
  eyeOffsetY: number,
  smooth: boolean,
  bodyYAxis?: { x: number; y: number; z: number },
): void {
  if (!controls) return;
  const tx = bodyYAxis ? pos.x + bodyYAxis.x * eyeOffsetY : pos.x;
  const ty = bodyYAxis ? pos.y + bodyYAxis.y * eyeOffsetY : pos.y + eyeOffsetY;
  const tz = bodyYAxis ? pos.z + bodyYAxis.z * eyeOffsetY : pos.z;
  controls.moveTo?.(tx, ty, tz, smooth);
  controls.update?.(0);
}
