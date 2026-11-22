import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BODY_SI, BODY_SOCKET_IDS, bodyEyeOffsetY, bodyRestCenterY, bodySpawnPosition, bodyStandingHeight } from "./index.js";

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !== ${b}`);

describe("@khr3/body SI constants", () => {
  it("stands 1.75 m tall with the centre at 0.95 m", () => {
    close(bodyRestCenterY(), 0.95);
    close(bodyStandingHeight(), 1.75);
  });

  it("puts the eye 0.67 m above the body centre (1.62 m from the floor)", () => {
    close(bodyEyeOffsetY(), 0.67);
    close(bodyRestCenterY() + bodyEyeOffsetY(), BODY_SI.eyeHeight);
  });

  it("spawns with the feet on the given floor", () => {
    const [, y] = bodySpawnPosition(0, 2, 0);
    close(y - bodyRestCenterY(), 2);
  });

  it("throws instead of inventing values", () => {
    assert.throws(() => bodyRestCenterY({ ...BODY_SI, capsuleRadius: 0 }), RangeError);
    assert.throws(() => bodyRestCenterY({ ...BODY_SI, floatHeight: Number.NaN }), RangeError);
    assert.throws(() => bodyEyeOffsetY({ ...BODY_SI, eyeHeight: 0.5 }), RangeError);
  });

  it("uses the shared NPC and launcher socket names", () => {
    assert.deepEqual([...BODY_SOCKET_IDS], ["Socket_Hand_R", "Socket_Hand_L", "Socket_Head", "Socket_Back"]);
  });
});
