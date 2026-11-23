import {
  JointRegistryContext,
  KhrCollider,
  KhrValidationError,
  claimBundleMount,
  releaseBundleMount,
  type JointCollider,
  type JointRuntime,
  type KhrAssetBundle,
  type KhrBodySpec,
  type KhrJointSpec,
} from "@khr3/core";
import { useFrame } from "@react-three/fiber";
import { RigidBody, type RapierCollider, type RapierRigidBody } from "@react-three/rapier";
import { useContext, useImperativeHandle, useLayoutEffect, useMemo, useRef, type Ref, type RefObject } from "react";
import * as THREE from "three";
import { withExcludeCharacterRay, type BodySocketId } from "./index.js";
import type { KhrBodyHandle } from "./KhrBody.js";

export interface HeldItemHandle {
  readonly socket: BodySocketId;
  readonly rigidBody: RapierRigidBody | null;
  setRoleTarget(role: string, target: number): number;
  setJointTarget(nodeName: string, target: number): number;
  getRoleValue(role: string): number;
}

export interface HeldItemProps {
  readonly ref?: Ref<HeldItemHandle>;
  readonly bundle: KhrAssetBundle;
  readonly socket: BodySocketId;
  readonly bodyRef?: RefObject<KhrBodyHandle | null>;
  readonly parentSocketObject?: THREE.Object3D | null;
  readonly userData?: Record<string, unknown>;
}

const _axis = new THREE.Vector3();
const _com = new THREE.Vector3();
const _invQ = new THREE.Quaternion();
const _worldPos = new THREE.Vector3();
const _worldQuat = new THREE.Quaternion();

let nextHeldAssemblyId = 100_000;

function effectiveInertia(body: KhrBodySpec, joint: KhrJointSpec): number {
  if (joint.kind === "fixed") return 0;
  if (joint.kind === "prismatic") return body.mass > 0 ? body.mass : 1;
  _axis.fromArray(joint.axis).normalize();
  _invQ.fromArray(body.inertiaOrientation).invert();
  const ap = _axis.clone().applyQuaternion(_invQ);
  const [ix, iy, iz] = body.inertiaDiagonal;
  const iCom = ix * ap.x * ap.x + iy * ap.y * ap.y + iz * ap.z * ap.z;
  _com.fromArray(body.centerOfMass);
  const along = _com.dot(_axis);
  const total = iCom + body.mass * (_com.lengthSq() - along * along);
  return total > 0 ? total : 1;
}

const poseOf = (b: KhrBodySpec) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(b.localPosition),
    new THREE.Quaternion().fromArray(b.localQuaternion),
    new THREE.Vector3(1, 1, 1),
  );

export function HeldItem({ ref, bundle, socket, bodyRef, parentSocketObject, userData }: HeldItemProps) {
  const registry = useContext(JointRegistryContext);
  const assemblyId = useMemo(() => nextHeldAssemblyId++, []);
  const rbRef = useRef<RapierRigidBody | null>(null);
  const fallbackSocketRef = useRef<THREE.Group | null>(null);
  const runtimesRef = useRef<Map<string, JointRuntime>>(new Map());
  const mergedUserData = useMemo(() => withExcludeCharacterRay(userData), [userData]);

  const colliderEntries = useMemo(() => {
    const entries: Array<{
      key: string;
      nodeName: string;
      spec: KhrBodySpec["colliders"][number];
      local: THREE.Matrix4;
      ref: { current: RapierCollider | null };
    }> = [];
    for (const b of bundle.bodies) {
      for (let k = 0; k < b.colliders.length; k++) {
        const c = b.colliders[k];
        const local = new THREE.Matrix4().compose(
          new THREE.Vector3().fromArray(c.localPosition),
          new THREE.Quaternion().fromArray(c.localQuaternion),
          new THREE.Vector3(1, 1, 1),
        );
        entries.push({ key: `${b.nodeName}:${k}`, nodeName: b.nodeName, spec: c, local, ref: { current: null } });
      }
    }
    return entries;
  }, [bundle]);

  useLayoutEffect(() => {
    claimBundleMount(bundle, "HeldItem");
    const savedPos = bundle.scene.position.clone();
    const savedQuat = bundle.scene.quaternion.clone();
    const savedParent = bundle.scene.parent;

    const grip = bundle.sockets.grip_primary ?? bundle.sockets.IK_Palm_Primary;
    if (grip) bundle.scene.position.set(-grip[0], -grip[1], -grip[2]);
    else bundle.scene.position.set(0, 0, 0);

    const targetSocket = parentSocketObject ?? bodyRef?.current?.socket(socket) ?? fallbackSocketRef.current;
    if (targetSocket && bundle.scene.parent !== targetSocket) targetSocket.add(bundle.scene);

    const byName = new Map(bundle.bodies.map((b) => [b.nodeName, b]));
    const rootBody = bundle.bodies.find((b) => !b.joint) ?? bundle.bodies[0];
    const invRoot = rootBody ? poseOf(rootBody).invert() : new THREE.Matrix4();
    const runtimes = new Map<string, JointRuntime>();

    for (const b of bundle.bodies) {
      const j = b.joint;
      if (!j) continue;
      const parentSpec = byName.get(j.connectedNodeName);
      const inRoot = invRoot.clone().multiply(poseOf(b));
      const restRelParent =
        parentSpec && parentSpec.joint ? poseOf(parentSpec).invert().multiply(poseOf(b)) : inRoot;
      const cols: JointCollider[] = colliderEntries
        .filter((e) => e.nodeName === b.nodeName)
        .map((e) => ({ ref: e.ref, local: e.local }));

      const d = j.drive;
      const rt: JointRuntime = {
        assemblyId,
        nodeName: b.nodeName,
        role: j.role ?? b.role,
        kind: j.kind,
        object: b.object,
        axis: new THREE.Vector3().fromArray(j.axis).normalize(),
        restPosition: b.object.position.clone(),
        restQuaternion: b.object.quaternion.clone(),
        q: 0,
        v: 0,
        positionTarget: d?.positionTarget ?? null,
        velocityTarget: d?.velocityTarget ?? 0,
        drive: d,
        limits: j.limits ? [j.limits[0], j.limits[1]] : null,
        limitStiffness: j.limitStiffness ?? null,
        limitDamping: j.limitDamping ?? 0,
        inertia: effectiveInertia(b, j),
        parent: null,
        restRelParent,
        current: restRelParent.clone(),
        stamp: -1,
        colliders: cols,
      };
      runtimes.set(rt.nodeName, rt);
    }
    for (const b of bundle.bodies) {
      if (!b.joint) continue;
      const rt = runtimes.get(b.nodeName)!;
      rt.parent = runtimes.get(b.joint.connectedNodeName) ?? null;
      registry?.add(rt);
    }
    runtimesRef.current = runtimes;

    return () => {
      for (const rt of runtimes.values()) {
        registry?.delete(rt);
        rt.object.position.copy(rt.restPosition);
        rt.object.quaternion.copy(rt.restQuaternion);
      }
      runtimesRef.current = new Map();
      if (bundle.scene.parent) bundle.scene.parent.remove(bundle.scene);
      if (savedParent) savedParent.add(bundle.scene);
      bundle.scene.position.copy(savedPos);
      bundle.scene.quaternion.copy(savedQuat);
      releaseBundleMount(bundle);
    };
  }, [bundle, socket, bodyRef, parentSocketObject, registry, assemblyId, colliderEntries]);

  useFrame(() => {
    const rb = rbRef.current;
    const targetSocket = parentSocketObject ?? bodyRef?.current?.socket(socket) ?? fallbackSocketRef.current;
    if (!rb || !targetSocket) return;
    if (bundle.scene.parent !== targetSocket) targetSocket.add(bundle.scene);
    bundle.scene.getWorldPosition(_worldPos);
    bundle.scene.getWorldQuaternion(_worldQuat);
    rb.setNextKinematicTranslation(_worldPos);
    rb.setNextKinematicRotation(_worldQuat);
  });

  useImperativeHandle(ref, () => {
    const applyTarget = (rt: JointRuntime, target: number): number => {
      if (!rt.drive || rt.drive.stiffness === undefined) {
        throw new KhrValidationError(`Joint "${rt.nodeName}" has no authored drive stiffness; cannot set a position target`);
      }
      const clamped = rt.limits ? Math.max(rt.limits[0], Math.min(rt.limits[1], target)) : target;
      rt.positionTarget = clamped;
      return clamped;
    };

    return {
      socket,
      get rigidBody() { return rbRef.current; },
      setJointTarget(nodeName: string, target: number): number {
        const rt = runtimesRef.current.get(nodeName);
        if (!rt) throw new KhrValidationError(`@khr3/body: HeldItem has no joint named "${nodeName}"`);
        return applyTarget(rt, target);
      },
      setRoleTarget(role: string, target: number): number {
        let matched = false;
        let clamped = target;
        for (const rt of runtimesRef.current.values()) {
          if (rt.role === role) { clamped = applyTarget(rt, target); matched = true; }
        }
        if (!matched) throw new KhrValidationError(`@khr3/body: HeldItem has no joint with role "${role}"`);
        return clamped;
      },
      getRoleValue(role: string): number {
        for (const rt of runtimesRef.current.values()) {
          if (rt.role === role) return rt.q;
        }
        throw new KhrValidationError(`@khr3/body: HeldItem has no joint with role "${role}"`);
      },
    };
  }, [socket]);

  return (
    <>
      <group ref={fallbackSocketRef} name={`HeldItem_Fallback_${socket}`} />
      <RigidBody ref={rbRef} type="kinematicPosition" colliders={false} sensor userData={mergedUserData}>
        {colliderEntries.map((e) => (
          <KhrCollider key={e.key} ref={e.ref} c={e.spec} />
        ))}
      </RigidBody>
    </>
  );
}
