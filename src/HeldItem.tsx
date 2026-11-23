import { useEffect, useImperativeHandle, useMemo, type Ref } from "react";
import * as THREE from "three";
import type { BodySocketId } from "./index.js";
import type { KhrBodyHandle } from "./KhrBody.js";

export interface HeldItemBodySpecLike {
  readonly nodeName: string;
  readonly role: string | null;
  readonly object: THREE.Object3D;
  readonly localPosition: readonly [number, number, number];
  readonly localQuaternion: readonly [number, number, number, number];
  readonly joint: {
    readonly kind: "revolute" | "prismatic" | "fixed";
    readonly axis: readonly [number, number, number];
    readonly limits: readonly [number, number] | null;
    readonly role: string | null;
  } | null;
}

export interface HeldItemBundleLike {
  readonly scene: THREE.Group;
  readonly bodies: readonly HeldItemBodySpecLike[];
  readonly sockets: Record<string, readonly [number, number, number]>;
}

export interface HeldItemController {
  readonly socket: BodySocketId;
  readonly mountedObject: THREE.Group;
  setRoleTarget(role: string, target: number): number;
  getRoleValue(role: string): number;
}

export interface HeldItemProps {
  readonly ref?: Ref<HeldItemController>;
  readonly bundle: HeldItemBundleLike;
  readonly socket: BodySocketId;
  readonly bodyRef?: React.RefObject<KhrBodyHandle | null>;
  readonly parentSocketObject?: THREE.Object3D | null;
}

const _axis = new THREE.Vector3();
const _baseQuat = new THREE.Quaternion();
const _deltaQuat = new THREE.Quaternion();

/**
 * Pure kinematic/view-model controller for a `@khr3/core` `KhrAssetBundle` held in a body socket.
 * Drives articulated parts (`slide`, `bolt`, `pump`, `trigger`) directly along their authored
 * `KHR_physics_rigid_bodies` joint axis, clamped to `joint.limits`, with zero Rapier impulse joints.
 */
export function createHeldItemController(
  bundle: HeldItemBundleLike,
  socket: BodySocketId = "Socket_Hand_R",
  parentSocket?: THREE.Object3D | null,
): HeldItemController {
  const grip = bundle.sockets.grip_primary;
  if (grip) {
    bundle.scene.position.set(-grip[0], -grip[1], -grip[2]);
  } else {
    bundle.scene.position.set(0, 0, 0);
  }
  if (parentSocket && bundle.scene.parent !== parentSocket) {
    parentSocket.add(bundle.scene);
  }

  const roleValues = new Map<string, number>();

  function setRoleTarget(role: string, target: number): number {
    let applied = target;
    for (const b of bundle.bodies) {
      const j = b.joint;
      if (!j) continue;
      const matches = b.role === role || j.role === role || b.nodeName.toLowerCase() === role.toLowerCase();
      if (!matches) continue;
      const clamped = j.limits ? Math.max(j.limits[0], Math.min(j.limits[1], target)) : target;
      applied = clamped;
      roleValues.set(role, clamped);
      if (j.kind === "prismatic") {
        b.object.position.set(
          b.localPosition[0] + j.axis[0] * clamped,
          b.localPosition[1] + j.axis[1] * clamped,
          b.localPosition[2] + j.axis[2] * clamped,
        );
      } else if (j.kind === "revolute") {
        _axis.set(j.axis[0], j.axis[1], j.axis[2]).normalize();
        _baseQuat.set(b.localQuaternion[0], b.localQuaternion[1], b.localQuaternion[2], b.localQuaternion[3]);
        _deltaQuat.setFromAxisAngle(_axis, clamped);
        b.object.quaternion.copy(_baseQuat).multiply(_deltaQuat);
      }
    }
    return applied;
  }

  function getRoleValue(role: string): number {
    return roleValues.get(role) ?? 0;
  }

  return {
    socket,
    mountedObject: bundle.scene,
    setRoleTarget,
    getRoleValue,
  };
}

export function HeldItem({ ref, bundle, socket, bodyRef, parentSocketObject }: HeldItemProps) {
  const controller = useMemo(
    () => createHeldItemController(bundle, socket, parentSocketObject ?? bodyRef?.current?.socket(socket) ?? null),
    [bundle, socket, parentSocketObject, bodyRef],
  );

  useEffect(() => {
    const targetParent = parentSocketObject ?? bodyRef?.current?.socket(socket) ?? null;
    if (targetParent && bundle.scene.parent !== targetParent) {
      targetParent.add(bundle.scene);
    }
    return () => {
      if (bundle.scene.parent) {
        bundle.scene.parent.remove(bundle.scene);
      }
    };
  }, [bundle, socket, bodyRef, parentSocketObject]);

  useImperativeHandle(ref, () => controller, [controller]);

  return null;
}
