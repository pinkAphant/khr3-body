import { Ecctrl, type EcctrlHandle, type EcctrlProps, type MovementInput } from "@pinkaphant/ecctrl";
import { EcctrlCameraControls, type EcctrlCameraControlsHandle } from "@pinkaphant/ecctrl/camera";
import { useFrame } from "@react-three/fiber";
import { useEffect, useImperativeHandle, useMemo, useRef, type ReactNode, type Ref } from "react";
import * as THREE from "three";
import {
  BODY_MOVE_TUNE,
  BODY_SI,
  BODY_SOCKET_IDS,
  bodyEyeOffsetY,
  stepCameraSync,
  type BodySiConstants,
  type BodySocketId,
} from "./index.js";

export { stepCameraSync };

export interface KhrBodyHandle {
  readonly ecctrl: EcctrlHandle | null;
  readonly cameraControls: EcctrlCameraControlsHandle | null;
  socket(id: BodySocketId): THREE.Object3D | null;
  syncCameraStep(pos: { x: number; y: number; z: number }): void;
}

export interface KhrBodyProps extends Omit<EcctrlProps, "ref"> {
  readonly ref?: Ref<KhrBodyHandle>;
  readonly si?: BodySiConstants;
  readonly smoothCamera?: boolean;
  readonly enableInput?: boolean;
  readonly viewModelChildren?: ReactNode;
  readonly socketOffsets?: Partial<Record<BodySocketId, readonly [number, number, number]>>;
}

const DEFAULT_SOCKET_OFFSETS: Readonly<Record<BodySocketId, readonly [number, number, number]>> = Object.freeze({
  Socket_Hand_R: [0.22, -0.18, -0.38],
  Socket_Hand_L: [-0.22, -0.18, -0.38],
  Socket_Head: [0, 0, -0.12],
  Socket_Back: [0, -0.25, 0.28],
});

const _partialMove: MovementInput = {
  forward: false,
  backward: false,
  leftward: false,
  rightward: false,
  run: false,
  jump: false,
};

export function KhrBody({
  ref,
  si = BODY_SI,
  smoothCamera = false,
  enableInput = true,
  enable = true,
  viewModelChildren,
  socketOffsets,
  children,
  ...ecctrlProps
}: KhrBodyProps) {
  const ecctrlRef = useRef<EcctrlHandle | null>(null);
  const camControlsRef = useRef<EcctrlCameraControlsHandle | null>(null);
  const viewModelGroupRef = useRef<THREE.Group | null>(null);
  const socketMapRef = useRef<Record<BodySocketId, THREE.Group | null>>({
    Socket_Hand_R: null,
    Socket_Hand_L: null,
    Socket_Head: null,
    Socket_Back: null,
  });

  const keysRef = useRef({ w: false, s: false, a: false, d: false, shift: false, space: false, dirty: false });
  const eyeOffsetY = useMemo(() => bodyEyeOffsetY(si), [si]);

  useEffect(() => {
    if (!enableInput || typeof window === "undefined") return;
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      const k = keysRef.current;
      if (e.code === "KeyW" || e.code === "ArrowUp") { if (k.w !== down) { k.w = down; k.dirty = true; } }
      else if (e.code === "KeyS" || e.code === "ArrowDown") { if (k.s !== down) { k.s = down; k.dirty = true; } }
      else if (e.code === "KeyA" || e.code === "ArrowLeft") { if (k.a !== down) { k.a = down; k.dirty = true; } }
      else if (e.code === "KeyD" || e.code === "ArrowRight") { if (k.d !== down) { k.d = down; k.dirty = true; } }
      else if (e.code === "ShiftLeft" || e.code === "ShiftRight") { if (k.shift !== down) { k.shift = down; k.dirty = true; } }
      else if (e.code === "Space") { if (k.space !== down) { k.space = down; k.dirty = true; } }
    };
    const kd = onKey(true), ku = onKey(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, [enableInput]);

  useImperativeHandle(ref, () => ({
    get ecctrl() {
      return ecctrlRef.current;
    },
    get cameraControls() {
      return camControlsRef.current;
    },
    socket(id: BodySocketId) {
      return socketMapRef.current[id] ?? null;
    },
    syncCameraStep(pos: { x: number; y: number; z: number }) {
      stepCameraSync(camControlsRef.current as unknown as Parameters<typeof stepCameraSync>[0], pos, eyeOffsetY, smoothCamera);
    },
  }), [eyeOffsetY, smoothCamera]);

  // Mount order #1: BodyInput (priority 0)
  useFrame(() => {
    if (!enable || !enableInput) return;
    const k = keysRef.current;
    if (!k.dirty) return;
    k.dirty = false;
    _partialMove.forward = k.w;
    _partialMove.backward = k.s;
    _partialMove.leftward = k.a;
    _partialMove.rightward = k.d;
    _partialMove.run = k.shift;
    _partialMove.jump = k.space;
    ecctrlRef.current?.setMovement(_partialMove);
  });

  const userData = useMemo(
    () => ({
      ...(ecctrlProps.userData ?? {}),
      ecctrl: {
        ...((ecctrlProps.userData as Record<string, any> | undefined)?.ecctrl ?? {}),
        excludeCharacterRay: true,
      },
    }),
    [ecctrlProps.userData],
  );

  return (
    <>
      <Ecctrl
        ref={ecctrlRef}
        enable={enable}
        capsuleHalfHeight={si.capsuleHalfHeight}
        capsuleRadius={si.capsuleRadius}
        floatHeight={si.floatHeight}
        maxWalkVel={BODY_MOVE_TUNE.maxWalkVel}
        maxRunVel={BODY_MOVE_TUNE.maxRunVel}
        accDeltaTime={BODY_MOVE_TUNE.accDeltaTime}
        decDeltaTime={BODY_MOVE_TUNE.decDeltaTime}
        slideGripFactor={BODY_MOVE_TUNE.slideGripFactor}
        moveImpulsePointOffset={BODY_MOVE_TUNE.moveImpulsePointOffset}
        airDragFactor={BODY_MOVE_TUNE.airDragFactor}
        enableToggleRun={BODY_MOVE_TUNE.enableToggleRun}
        userData={userData}
        {...ecctrlProps}
      >
        {children}
      </Ecctrl>

      <EcctrlCameraControls ref={camControlsRef} />

      <BodyPostEcctrlSync
        enable={enable}
        ecctrlRef={ecctrlRef}
        camControlsRef={camControlsRef}
        viewModelGroupRef={viewModelGroupRef}
        eyeOffsetY={eyeOffsetY}
        smoothCamera={smoothCamera}
      />

      <group ref={viewModelGroupRef} name="KhrBody_ViewModel">
        {BODY_SOCKET_IDS.map((id) => {
          const off = socketOffsets?.[id] ?? DEFAULT_SOCKET_OFFSETS[id];
          return (
            <group
              key={id}
              name={id}
              position={[off[0], off[1], off[2]]}
              ref={(g) => {
                socketMapRef.current[id] = g;
              }}
            />
          );
        })}
        {viewModelChildren}
      </group>
    </>
  );
}

function BodyPostEcctrlSync({
  enable,
  ecctrlRef,
  camControlsRef,
  viewModelGroupRef,
  eyeOffsetY,
  smoothCamera,
}: {
  readonly enable: boolean;
  readonly ecctrlRef: React.RefObject<EcctrlHandle | null>;
  readonly camControlsRef: React.RefObject<EcctrlCameraControlsHandle | null>;
  readonly viewModelGroupRef: React.RefObject<THREE.Group | null>;
  readonly eyeOffsetY: number;
  readonly smoothCamera: boolean;
}) {
  // Mount order #4 & #5: BodyCameraSync + ViewModelSync (priority 0, mounted after <Ecctrl>)
  useFrame((state) => {
    if (!enable) return;
    const handle = ecctrlRef.current;
    if (handle) {
      stepCameraSync(
        camControlsRef.current as unknown as Parameters<typeof stepCameraSync>[0],
        handle.currPos,
        eyeOffsetY,
        smoothCamera,
      );
    }
    const vm = viewModelGroupRef.current;
    if (vm) {
      vm.position.copy(state.camera.position);
      vm.quaternion.copy(state.camera.quaternion);
    }
  });
  return null;
}
