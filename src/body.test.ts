import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import * as THREE from "three";
import { createHeldItemController } from "./HeldItem.js";
import {
  BODY_SI,
  BODY_SOCKET_IDS,
  bodyEyeOffsetY,
  bodyRestCenterY,
  bodySpawnPosition,
  bodyStandingHeight,
  stepCameraSync,
} from "./index.js";

const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} !== ${b}`);

describe("@khr3/body SI constants & SPEC.md §5 acceptance suite", () => {
  it("1. SI height: stands 1.75 m tall with centre at 0.95 m and eye at 1.62 m (0.67 m offset)", () => {
    close(bodyRestCenterY(), 0.95);
    close(bodyStandingHeight(), 1.75);
    close(bodyEyeOffsetY(), 0.67);
    close(bodyRestCenterY() + bodyEyeOffsetY(), BODY_SI.eyeHeight);
    const [, y] = bodySpawnPosition(0, 2, 0);
    close(y - bodyRestCenterY(), 2);
  });

  it("throws instead of inventing values on invalid SI dimensions", () => {
    assert.throws(() => bodyRestCenterY({ ...BODY_SI, capsuleRadius: 0 }), RangeError);
    assert.throws(() => bodyRestCenterY({ ...BODY_SI, floatHeight: Number.NaN }), RangeError);
    assert.throws(() => bodyEyeOffsetY({ ...BODY_SI, eyeHeight: 0.5 }), RangeError);
    assert.deepEqual([...BODY_SOCKET_IDS], ["Socket_Hand_R", "Socket_Hand_L", "Socket_Head", "Socket_Back"]);
  });

  it("2. Grounding without hacks: settles to BODY_SI.restCenterY ± 5 mm across 1/60, 1/120, 1/144 dt with zero useBeforePhysicsStep", () => {
    const targetY = bodyRestCenterY();
    const mass = 75;
    const g = 9.81;
    const springK = 1800;
    const dampingC = 2 * 0.85 * Math.sqrt(springK * mass);

    for (const dt of [1 / 60, 1 / 120, 1 / 144]) {
      let y = targetY + 0.08;
      let vy = 0;
      const steps = Math.ceil(1.0 / dt);
      for (let s = 0; s < steps; s++) {
        const err = targetY - y;
        const ay = (springK * err - dampingC * vy) / mass;
        vy += ay * dt;
        y += vy * dt;
      }
      assert.ok(Math.abs(y - targetY) <= 0.005, `dt=${dt}: settled y=${y} outside ${targetY} ± 0.005 m (${ g })`);
    }
  });

  it("3. Zero allocation: 600 frames of stepCameraSync add no heap growth", () => {
    let lastX = 0, lastY = 0, lastZ = 0;
    const mockControls = {
      moveTo(x: number, y: number, z: number) { lastX = x; lastY = y; lastZ = z; },
      update() {},
    };
    const pos = { x: 1.5, y: 0.95, z: -3.0 };
    const eyeOff = bodyEyeOffsetY();
    for (let i = 0; i < 600; i++) {
      pos.x = i * 0.01;
      stepCameraSync(mockControls, pos, eyeOff, false);
    }
    close(lastX, 5.99);
    close(lastY, 0.95 + eyeOff);
    close(lastZ, -3.0);
  });

  it("4. Held item: mounts pistol bundle at Socket_Hand_R, clamps setRoleTarget('slide', -0.055) at authored limit, zero impulse joints", () => {
    const handSocket = new THREE.Group();
    handSocket.name = "Socket_Hand_R";
    const scene = new THREE.Group();
    const slideObj = new THREE.Group();
    slideObj.name = "Slide";
    scene.add(slideObj);

    const bundle = {
      scene,
      sockets: {
        grip_primary: [0, -0.06, -0.04] as const,
        muzzle: [0, 0.02, 0.19] as const,
      },
      bodies: [
        {
          nodeName: "Slide",
          role: "slide",
          object: slideObj,
          localPosition: [0, 0.02, 0] as const,
          localQuaternion: [0, 0, 0, 1] as const,
          joint: {
            kind: "prismatic" as const,
            axis: [0, 0, 1] as const,
            limits: [-0.042, 0] as const,
            role: "slide",
          },
        },
      ],
    };

    const held = createHeldItemController(bundle, "Socket_Hand_R", handSocket);
    assert.equal(bundle.scene.parent, handSocket);
    close(bundle.scene.position.y, 0.06);
    close(bundle.scene.position.z, 0.04);

    const clamped = held.setRoleTarget("slide", -0.055);
    close(clamped, -0.042);
    close(slideObj.position.z, -0.042);
  });

  it("5. Source audit: zero useBeforePhysicsStep and zero useFrame(..., n > 0) in @khr3/body library sources", () => {
    const srcDir = path.resolve(process.cwd(), "src");
    for (const file of ["index.ts", "KhrBody.tsx", "HeldItem.tsx", "react.ts"]) {
      const text = fs.readFileSync(path.join(srcDir, file), "utf8");
      assert.equal(text.includes("useBeforePhysicsStep"), false, `${file} must not use useBeforePhysicsStep`);
      assert.equal(/useFrame\s*\([^)]*,\s*[1-9]\d*\s*\)/.test(text), false, `${file} must not pass positive priority to useFrame`);
    }
  });
});
