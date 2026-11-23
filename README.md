# `@khr3/body`

SI first-person and third-person player body constants (`@khr3/body`) and React Three Fiber `<Ecctrl>` + `<HeldItem>` glue (`@khr3/body/react`) layered directly on `@pinkaphant/ecctrl` (`^2.0.4-beta.3`) and `@khr3/core`.

- **Zero-dependency SI constants & camera helpers (`@khr3/body`, [src/index.ts](./src/index.ts))**: `BODY_SI` (`1.75 m` standing height, `1.62 m` eye height, `0.30 m` radius, `0.50 m` half-height, `0.15 m` float height), `BODY_MOVE_TUNE`, `BODY_SOCKET_IDS`, `bodyRestCenterY`, `bodyStandingHeight`, `bodyEyeOffsetY`, `bodySpawnPosition`, `stepCameraSync`, and `withExcludeCharacterRay`.
- **React Three Fiber body & held-item glue (`@khr3/body/react`, [src/react.ts](./src/react.ts))**: `<KhrBody>` ([src/KhrBody.tsx](./src/KhrBody.tsx)) and `<HeldItem>` ([src/HeldItem.tsx](./src/HeldItem.tsx)), with zero `koota` and zero Rapier impulse joints.
- **API Guide & Spec**: See [docs/api-reference.md](./docs/api-reference.md) and [SPEC.md](./SPEC.md).
