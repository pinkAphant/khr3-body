import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { KhrValidationError, PhysicsWorld, exportKhrGlb, loadKhrGlb } from "@khr3/core";
import { CuboidCollider, RigidBody, useRapier, type RapierContext } from "@react-three/rapier";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import React, { Suspense, type ReactNode } from "react";
import * as THREE from "three";
import {
  BODY_SI,
  BODY_SOCKET_IDS,
  HeldItem,
  KhrBody,
  bodyEyeOffsetY,
  bodyRestCenterY,
  bodySpawnPosition,
  bodyStandingHeight,
  stepCameraSync,
  withExcludeCharacterRay,
  type HeldItemHandle,
  type KhrBodyHandle,
} from "./react.js";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const close = (a: number, b: number, tol = 1e-9, msg?: string) =>
  assert.ok(Math.abs(a - b) <= tol, msg ?? `Expected ${a} to be within ${tol} of ${b}`);

/** Balanced-parenthesis scanner catching single-line, nested-call, and multi-line `useFrame(..., priority > 0)`. */
function hasPositiveUseFramePriority(source: string): boolean {
  const re = /\buseFrame\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    let idx = match.index + match[0].length;
    let depth = 1;
    let topComma = -1;
    let inStr: string | null = null;
    while (idx < source.length && depth > 0) {
      const ch = source[idx];
      if (inStr) {
        if (ch === "\\") idx++;
        else if (ch === inStr) inStr = null;
      } else if (ch === '"' || ch === "'" || ch === "`") inStr = ch;
      else if (ch === "(" || ch === "{" || ch === "[") depth++;
      else if (ch === ")" || ch === "}" || ch === "]") {
        depth--;
        if (depth === 0) break;
      } else if (ch === "," && depth === 1 && topComma === -1) topComma = idx;
      idx++;
    }
    if (topComma !== -1 && depth === 0) {
      const priorityArg = source.slice(topComma + 1, idx).trim();
      if (priorityArg.length > 0 && !/^0(?:\.0+)?$/.test(priorityArg)) {
        const num = Number(priorityArg);
        if (!Number.isNaN(num) ? num > 0 : true) return true;
      }
    }
  }
  return false;
}

async function mountHeadlessWorld(ui: ReactNode) {
  await RAPIER.init();
  let rapierCtx: RapierContext | null = null;
  function ContextProbe() {
    rapierCtx = useRapier();
    return null;
  }
  const wrap = (content: ReactNode) => (
    <Suspense fallback={null}>
      <PhysicsWorld gravity={[0, -9.81, 0]} maxDelta={1 / 15}>
        <ContextProbe />
        <RigidBody type="fixed" position={[0, -0.5, 0]} colliders={false}>
          <CuboidCollider args={[30, 0.5, 30]} friction={1.0} />
        </RigidBody>
        {content}
      </PhysicsWorld>
    </Suspense>
  );
  const renderer = await ReactThreeTestRenderer.create(wrap(ui));
  for (let i = 0; i < 40 && !rapierCtx; i++) {
    await ReactThreeTestRenderer.act(async () => { await new Promise((r) => setTimeout(r, 5)); });
  }
  assert.ok(rapierCtx, "Headless Rapier context mounted");
  const stepFrames = async (frames: number, dt: number) => {
    await ReactThreeTestRenderer.act(async () => {
      for (let i = 0; i < frames; i++) await renderer.advanceFrames(1, dt);
    });
  };
  return { renderer, rapierCtx: rapierCtx!, stepFrames, unmount: () => renderer.unmount() };
}

describe("@khr3/body SI constants & SPEC.md §5 acceptance suite", () => {
  it("1. SI height: stands 1.75 m tall with centre at 0.95 m and eye at 1.62 m (0.67 m offset)", () => {
    close(bodyRestCenterY(), 0.95);
    close(bodyStandingHeight(), 1.75);
    close(bodyEyeOffsetY(), 0.67);
    close(bodyRestCenterY() + bodyEyeOffsetY(), BODY_SI.eyeHeight);
    const [, y] = bodySpawnPosition(0, 2, 0);
    close(y - bodyRestCenterY(), 2);
    const merged = withExcludeCharacterRay({ customTag: "pistol", ecctrl: { excludeVehicleRay: true } });
    assert.equal(merged.customTag, "pistol");
    assert.deepEqual(merged.ecctrl, { excludeVehicleRay: true, excludeCharacterRay: true });
  });

  it("throws instead of inventing values on invalid SI dimensions", () => {
    assert.throws(() => bodyRestCenterY({ ...BODY_SI, capsuleRadius: 0 }), RangeError);
    assert.throws(() => bodyRestCenterY({ ...BODY_SI, floatHeight: Number.NaN }), RangeError);
    assert.throws(() => bodyEyeOffsetY({ ...BODY_SI, eyeHeight: 0.5 }), RangeError);
    assert.deepEqual([...BODY_SOCKET_IDS], ["Socket_Hand_R", "Socket_Hand_L", "Socket_Head", "Socket_Back"]);
  });

  it("2. Grounding without hacks: headless Rapier <PhysicsWorld> + <KhrBody> settles to BODY_SI.restCenterY ± 5 mm at 1/60, 1/120, 1/144 dt", async () => {
    const targetY = bodyRestCenterY();
    for (const dt of [1 / 60, 1 / 120, 1 / 144]) {
      const bodyRef = { current: null as KhrBodyHandle | null };
      const world = await mountHeadlessWorld(
        <KhrBody
          ref={bodyRef}
          position={[0, targetY + 0.06, 0]}
          enableInput={false}
          makeDefaultCamera={false}
          userData={{ playerTag: "hero" }}
        />,
      );
      await world.stepFrames(Math.ceil(1.5 / dt), dt);
      const ctrl = bodyRef.current?.ecctrl;
      assert.ok(ctrl, "KhrBody exposed live EcctrlHandle");
      assert.equal(ctrl.isOnGround, true, `dt=${dt}: expected isOnGround === true`);
      close(ctrl.currPos.y, targetY, 0.005, `dt=${dt}: settled currPos.y=${ctrl.currPos.y.toFixed(5)} outside ${targetY} ± 0.005 m`);

      const rbUserData = ctrl.body.userData as Record<string, any>;
      assert.equal(rbUserData.playerTag, "hero");
      assert.equal(rbUserData.ecctrl?.excludeVehicleRay, true);
      assert.equal(rbUserData.ecctrl?.excludeCharacterRay, undefined);
      await world.unmount();
    }
  });

  it("3. Zero allocation: 600 frames of stepCameraSync allocate zero heap objects", () => {
    let lastX = 0, lastY = 0, lastZ = 0;
    const mockControls = {
      moveTo(x: number, y: number, z: number) { lastX = x; lastY = y; lastZ = z; },
      update() {},
    };
    const pos = { x: 1.5, y: 0.95, z: -3.0 };
    const up = { x: 0, y: 1, z: 0 };
    const eyeOff = bodyEyeOffsetY();
    for (let i = 0; i < 200; i++) { pos.x = i * 0.01; stepCameraSync(mockControls, pos, eyeOff, false, up); }
    globalThis.gc?.();
    const heapBefore = process.memoryUsage().heapUsed;
    for (let i = 0; i < 600; i++) { pos.x = i * 0.01; stepCameraSync(mockControls, pos, eyeOff, false, up); }
    globalThis.gc?.();
    const deltaBytes = Math.max(0, process.memoryUsage().heapUsed - heapBefore);
    assert.ok(deltaBytes < 4096, `Expected zero retained heap growth across 600 frames, got ${deltaBytes} bytes`);
    close(lastX, 5.99);
    close(lastY, 0.95 + eyeOff);
    close(lastZ, -3.0);
  });

  it("4. Held item: mounts @khr3/core pistol bundle at Socket_Hand_R, drives setRoleTarget('slide', -0.055) via JointRegistryContext to clamped limit with zero impulse joints", async () => {
    const root = new THREE.Group();
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.18));
    receiver.name = "Receiver";
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.03, 0.17));
    slide.name = "Slide_Blowback";
    slide.position.set(0, 0.04, 0);
    receiver.add(slide);
    root.add(receiver);

    const glb = await exportKhrGlb(
      root,
      [
        { nodeName: "Receiver", motion: { isKinematic: true }, collider: { shape: { type: "box", size: [0.04, 0.12, 0.18] } } },
        {
          nodeName: "Slide_Blowback",
          motion: { isKinematic: false, mass: 0.25 },
          collider: { shape: { type: "box", size: [0.036, 0.03, 0.17] } },
          joint: {
            connectedNodeName: "Receiver",
            kind: "prismatic",
            axis: [0, 0, 1],
            limits: [-0.042, 0],
            drive: { mode: "acceleration", positionTarget: 0, stiffness: 2400, damping: 100 },
          },
          extras: { role: "slide" },
        },
      ],
      { ikSockets: { grip_primary: [0, -0.06, -0.04] } },
    );

    const pistolBundle = await loadKhrGlb(glb);
    const slideSpec = pistolBundle.bodies.find((b) => b.nodeName === "Slide_Blowback")!;
    const bodyRef = { current: null as KhrBodyHandle | null };
    const heldRef = { current: null as HeldItemHandle | null };

    const world = await mountHeadlessWorld(
      <>
        <KhrBody ref={bodyRef} enableInput={false} makeDefaultCamera={false} />
        <HeldItem ref={heldRef} bundle={pistolBundle} socket="Socket_Hand_R" bodyRef={bodyRef} />
      </>,
    );
    await world.stepFrames(2, 1 / 60);

    const handSocket = bodyRef.current!.socket("Socket_Hand_R");
    assert.ok(handSocket, "Socket_Hand_R exists on KhrBody");
    assert.equal(pistolBundle.scene.parent, handSocket, "HeldItem parented bundle.scene to Socket_Hand_R");
    close(pistolBundle.scene.position.y, 0.06, 1e-6);
    close(pistolBundle.scene.position.z, 0.04, 1e-6);

    const heldRbUserData = heldRef.current!.rigidBody?.userData as Record<string, any> | undefined;
    assert.equal(heldRbUserData?.ecctrl?.excludeCharacterRay, true);
    assert.throws(() => heldRef.current!.setRoleTarget("unknown_role", -0.055), KhrValidationError);

    const clamped = heldRef.current!.setRoleTarget("slide", -0.055);
    close(clamped, -0.042, 1e-6);
    await world.stepFrames(45, 1 / 60);

    close(heldRef.current!.getRoleValue("slide"), -0.042, 1e-3);
    close(slideSpec.object.position.z, -0.042, 1e-3);
    assert.equal(world.rapierCtx.world.impulseJoints.len(), 0, "Zero Rapier impulse joints used");
    await world.unmount();
  });

  it("5. Source audit: balanced-paren scanner detects all positive useFrame priorities and verifies src/ is clean", () => {
    assert.equal(hasPositiveUseFramePriority("useFrame(cb, 2)"), true);
    assert.equal(hasPositiveUseFramePriority("useFrame(() => { x(); }, 2)"), true);
    assert.equal(hasPositiveUseFramePriority("useFrame(\n  (state) => {\n    foo(bar());\n  },\n  1\n)"), true);
    assert.equal(hasPositiveUseFramePriority("useFrame(() => { x(); })"), false);
    assert.equal(hasPositiveUseFramePriority("useFrame(() => { x(); }, 0)"), false);

    const srcDir = path.resolve(process.cwd(), "src");
    for (const file of ["index.ts", "KhrBody.tsx", "HeldItem.tsx", "react.ts"]) {
      const text = fs.readFileSync(path.join(srcDir, file), "utf8");
      assert.equal(text.includes("useBeforePhysicsStep"), false, `${file} must not use useBeforePhysicsStep`);
      assert.equal(hasPositiveUseFramePriority(text), false, `${file} must not pass positive priority to useFrame`);
    }
  });
});
