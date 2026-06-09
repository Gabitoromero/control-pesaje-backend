# Tasks: Rediseño de Autenticación y Sesiones v1.5 — Backend

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 700–870 (production ~430, tests ~340) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: Model + Migration + Seed → PR 2: auth.service + middleware + sesion.service → PR 3: Controller + Routes + Schemas (includes sesion-linea endpoint) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

Note: the `POST /api/auth/sesion-linea` endpoint (controller handler `abrirSesionLinea`, route wiring, `SesionLineaSchema`) belongs in **PR 3** alongside the login rewrite. It reuses `iniciarSesion` + `obtenerSesionPorUsuario` from the sesion.service (PR 2), so the PR ordering is preserved. The additional endpoint adds roughly 40–60 lines of production code and 60–80 lines of tests relative to the original estimate.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Entity + Migration + Seed (data layer) | PR 1 | Base; all other units depend on this schema |
| 2 | auth.service + auth.middleware + sesion.service (domain logic) | PR 2 | Depends on PR 1 entity shape; includes role-aware lazy-expiry change |
| 3 | Controller + Routes + Schemas + usuario.service cleanup | PR 3 | Depends on PR 2 services; includes `abrirSesionLinea` + `SesionLineaSchema` |

---

## Work Unit 1 — Model + Migration + Seed

**Spec refs:** `usuario Model v1.5 (MODIFIED)`, `UsuarioCreateSchema v1.5 (MODIFIED)`, `contrasenaHash on usuario model — REMOVED`

### 1.1 — RED: Entity shape tests (models.test.ts)

- [x] 1.1 In `src/models.test.ts`: write failing tests asserting `Usuario` has `legajo` (non-nullable string), `pinHash` (non-nullable string), and NO `contrasenaHash` property. Run `pnpm test run` — confirm red.

### 1.2 — GREEN: Update `Usuario.ts` entity

- [x] 1.2 In `src/models/Usuario.ts`: remove `@Property contrasenaHash`; change `legajo` and `pinHash` from `nullable: true` to non-nullable (remove `nullable` option and `?`). Leave `datosAdicionales` nullable as-is. Confirm 1.1 green.

### 1.3 — Hand-write DB migration

- [x] 1.3 Create `src/migrations/Migration20260609000000_AuthV15.ts` (extends MikroORM `Migration`). `up()` in exact order: (1) `UPDATE "usuario" SET "pin_hash" = '<bcrypt-sentinel>' WHERE "pin_hash" IS NULL`, (2) `UPDATE "usuario" SET "legajo" = 'LEG-' || "id"::text WHERE "legajo" IS NULL`, (3) `ALTER TABLE "usuario" ALTER COLUMN "legajo" SET NOT NULL`, (4) `ALTER TABLE "usuario" ALTER COLUMN "pin_hash" SET NOT NULL`, (5) `ALTER TABLE "usuario" DROP COLUMN "contrasena_hash"`. `down()`: re-add `contrasena_hash` as nullable varchar, drop NOT NULL on `pin_hash` and `legajo`.

### 1.4 — Rewrite `seed.ts`

- [x] 1.4 In `src/seed.ts`: rewrite all 5 seed users to use `legajo` + `pinHash` (bcrypt hash of their PIN). Remove any `contrasenaHash` generation. Ensure all 5 users satisfy the NOT NULL constraints after the migration.

### 1.5 — Cleanup `usuario.service.ts` mapCredentials

- [x] 1.5 In `src/services/usuario.service.ts`: remove the `contrasena → contrasenaHash` branch from `mapCredentials`. Verify `pin → pinHash` branch remains and produces correct output.

---

## Work Unit 2 — auth.service + auth.middleware + sesion.service

**Spec refs:** `User Authentication Endpoint — Unified Login (MODIFIED)`, `JWT Payload Claims (MODIFIED)`, `Login Rate Limiting Keyed by Legajo (MODIFIED)`, `Obtener Sesión Activa — Unified SesionActiva Shape (MODIFIED)`, `In-Memory Line Session Scope (ADDED)`, `Global Session Map — REMOVED`

### 2.1 — RED: auth.service tests

- [x] 2.1 In `src/services/auth.service.test.ts`: remove all password-login and `hashPassword` tests. Add failing tests: (a) `login(legajo, correctPin)` returns a JWT string; (b) decoded JWT has `puedeTomarMuestrasLibres` as boolean; (c) decoded JWT `exp` is ~12h from now; (d) `login(unknownLegajo, pin)` → `null`; (e) `login(legajo, wrongPin)` → `null`; (f) `login(legajo, pin)` where `activo: false` → `null`. Run `pnpm test run` — confirm red.

### 2.2 — GREEN: Rewrite `auth.service.ts` login

- [x] 2.2 In `src/services/auth.service.ts`: rewrite `login(legajo: string, pin: string): Promise<string | null>`. Find user by `{ legajo, activo: true }`. Use `bcrypt.compare(pin, usuario.pinHash)`. Sign JWT with `{ id, nombreUsuario, rol, puedeTomarMuestrasLibres }` and `expiresIn: '12h'`. Remove `hashPassword`. Optionally remove `validatePin` (no remaining callers after unit 3). Confirm 2.1 green.

### 2.3 — RED: auth.middleware test

- [x] 2.3 In `src/middlewares/auth.middleware.test.ts`: add failing test — token signed with `puedeTomarMuestrasLibres: true` is verified and `req.user.puedeTomarMuestrasLibres` is `true` (boolean, not string, not absent). Run `pnpm test run` — confirm red.

### 2.4 — GREEN: Fix `JWTPayload` interface in `auth.middleware.ts`

- [x] 2.4 In `src/middlewares/auth.middleware.ts`: add `puedeTomarMuestrasLibres: boolean` to the `JWTPayload` interface. No logic change. Confirm 2.3 green.

### 2.5 — RED: sesion.service tests — SesionActiva shape + globalSessions removal + role-aware lazy expiry

- [x] 2.5 In `src/services/sesion.service.test.ts`: remove all `globalSessions` / `iniciarSesion(null, ...)` / `obtenerSesionGlobal` / `cerrarSesionGlobal` tests. Remove any test asserting "jefe never gets a session" or "jefe session is not invalidated by lazy check" — those are now wrong. Add failing tests: (a) `iniciarSesion(lineaProduccionId, usuarioId, usuarioRol)` sets `usuarioId`, `usuarioRol`, `ultimaActividadAt`; response has NO `usuarioIdGlobal`, `usuarioIdUsuario`, `rolUsuario`, `usuarioUltimaActividadAt`; (b) lazy expiry after 5+ min clears `usuarioId`/`usuarioRol`/`ultimaActividadAt` for a session with `usuarioRol: "operario"`; (c) lazy expiry after 5+ min clears `usuarioId`/`usuarioRol`/`ultimaActividadAt` for a session with `usuarioRol: "jefe"` (jefe IS subject to expiry on a line); (d) lazy expiry after 5+ min does NOT clear anything for a session with `usuarioRol: "administrador"` (admin exempt); (e) `obtenerSesion` returns `null` when no session exists. Run red.

### 2.6 — GREEN: Rewrite `SesionActiva` interface + remove globalSessions in `sesion.service.ts`

- [x] 2.6 In `src/services/sesion.service.ts`: replace `SesionActiva` with the unified flat interface (`lineaProduccionId`, `usuarioId`, `usuarioRol`, `pasadaId`, `connectedAt`, `ultimaActividadAt`). Remove `globalSessions` map, `cerrarSesionGlobal`, `obtenerSesionGlobal`. Update `iniciarSesion` signature — drop global param, make `lineaProduccionId` required `number`. Update field references in `obtenerSesion`, `obtenerSesionPorUsuario`, `actualizarActividad`, `actualizarPasada`, `limpiar`. Replace the old `=== OPERARIO` role guard in the lazy-expiry check with `session.usuarioRol === 'operario' || session.usuarioRol === 'jefe'` — admin is exempt, operario and jefe are both subject to the 5-min expiry. Confirm 2.5 green.

### 2.7 — RED: sesion.service tests — legajo rate-limiter

- [x] 2.7 In `src/services/sesion.service.test.ts`: add failing tests: (a) `registrarIntentoFallido(legajo)` 5 times → `estaBloqueada(legajo)` is `true`; (b) 6th attempt within window → `estaBloqueada` still `true`, no DB call expected; (c) lock expires: mock `Date.now()` past 3 min → `estaBloqueada` is `false`; (d) `resetearIntentos(legajo)` after 3 failures → `estaBloqueada` is `false` (reset-on-success). Run red.

### 2.8 — GREEN: Re-key rate-limiter in `sesion.service.ts`

- [x] 2.8 In `src/services/sesion.service.ts`: change `failedAttempts` and `lockExpires` Maps from `Map<number, ...>` to `Map<string, ...>`. Update `registrarIntentoFallido(legajo: string)`, `estaBloqueada(legajo: string)`, `resetearIntentos(legajo: string)`. Update constants to `LOGIN_MAX_ATTEMPTS = 5` and `LOGIN_LOCK_MS = 3 * 60 * 1000`. Remove old `resetearIntentos` call from `iniciarSesion`. Confirm 2.7 green.

---

## Work Unit 3 — Controller + Routes + Schemas

**Spec refs:** `User Authentication Endpoint — Unified Login (MODIFIED)`, `Cierre de Sesión (Simplified — MODIFIED)`, `Obtener Sesión Activa — Unified SesionActiva Shape (MODIFIED)`, `PATCH /api/auth/actividad — Reset Line Session Activity (ADDED)`, `Open Line Session — POST /api/auth/sesion-linea (ADDED)`, `Removed Endpoints Return 404 (ADDED)`, `UsuarioCreateSchema v1.5 (MODIFIED)`, `Login Rate Limiting Keyed by Legajo (MODIFIED)`

### 3.1 — RED: Schema tests

- [x] 3.1 In `src/api.test.ts` (or a dedicated schema block): add failing tests: (a) `LoginSchema` accepts `{ legajo: "12345", pin: "1234" }` and rejects `{ pin: "abc" }` (400); (b) `ActividadSchema` accepts `{ lineaProduccionId: 2 }` and rejects non-numeric; (c) `SesionLineaSchema` accepts `{ lineaProduccionId: 1 }` and rejects `{ lineaProduccionId: "abc" }` and `{ lineaProduccionId: -1 }` (non-positive int); (d) `UsuarioCreateSchema` requires `legajo` and `pin`, rejects `contrasena`; (e) `VerificarPinSchema` and `ActivarSesionSchema` are no longer importable (removed). Run red.

### 3.2 — GREEN: Rewrite schemas in `src/utils/schemas.ts` and `src/shared/schemas.ts`

- [x] 3.2 In `src/utils/schemas.ts`: replace v1.4 `LoginSchema` (`nombreUsuario`+`contrasena`) with v1.5 (`legajo: z.string().min(1)`, `pin: z.string().regex(/^\d{4,6}$/)`). Remove `VerificarPinSchema` and `ActivarSesionSchema`. Add `ActividadSchema` (`lineaProduccionId: z.number().int().positive()`). Add `SesionLineaSchema` (`lineaProduccionId: z.number().int().positive()`). In `src/shared/schemas.ts`: remove `contrasena` from `UsuarioCreateSchema`; add `legajo: z.string().min(1)` and `pin: z.string().regex(/^\d{4,6}$/)` as required. Confirm 3.1 green.

### 3.3 — RED: API integration tests — login rewrite + removed routes

- [x] 3.3 In `src/api.test.ts`: remove v1.4 `POST /api/auth/login` (password) tests and all `verificar-pin`/`activar-sesion` tests. Add failing tests: (a) `POST /api/auth/login` with `{ legajo, pin }` valid → 200 with `{ success: true, data: { token } }`; (b) wrong pin → 401; (c) inactive user → 401; (d) invalid body (`pin: "abc"`) → 400 with `details`; (e) `POST /api/auth/verificar-pin` any body → 404; (f) `POST /api/auth/activar-sesion` any body → 404; (g) 5 failed login attempts with same legajo → 6th returns 429; (h) success after failures resets counter (next attempt succeeds → 200). Run red.

### 3.3b — RED: API integration tests — POST /api/auth/sesion-linea

- [x] 3.3b In `src/api.test.ts`: add failing tests for the new endpoint: (a) operario with valid JWT + no existing session + valid body → 201 (or 200) with `{ success: true, data: <SesionActiva> }` and `usuarioRol: "operario"`; (b) jefe with valid JWT → 201 (or 200) with `usuarioRol: "jefe"`; (c) visualizacion JWT → 403; (d) same user already on a different line → 409 with `{ error: { code: "SESSION_CONFLICT", data: { lineaProduccionId: <existing> } } }`; (e) no JWT → 401; (f) body `{ lineaProduccionId: "abc" }` with valid JWT → 400 Zod error. Run red.

### 3.4 — RED: API integration tests — PATCH /actividad + sesion-activa shape

- [x] 3.4 In `src/api.test.ts`: add failing tests: (a) `PATCH /api/auth/actividad` with valid JWT + existing session → 200 `{ success: true, data: { ultimaActividadAt: <iso> } }`; (b) no session → 404; (c) no JWT → 401; (d) invalid body → 400; (e) `GET /api/auth/sesion-activa/:lineaId` response has `usuarioId`, `usuarioRol`, `ultimaActividadAt` and does NOT contain `usuarioIdGlobal`, `usuarioIdUsuario`, `rolUsuario`, `usuarioUltimaActividadAt`. Run red.

### 3.5 — GREEN: Rewrite `auth.controller.ts`

- [x] 3.5 In `src/controllers/auth.controller.ts`: rewrite `login` handler — call `sesionService.estaBloqueada(legajo)` first (→ 429 if locked); call `authService.login(legajo, pin)` (→ 401 on null); call `sesionService.resetearIntentos(legajo)` on success (→ 200 `{ token }`); call `sesionService.registrarIntentoFallido(legajo)` on null (→ 401). Delete `verificarPin` and `activarSesion` handler methods. Simplify `cerrarSesion` — remove global-session branch (line-session close only). Simplify `getActiveSesion` — return unified `SesionActiva` shape directly. Add `actualizarActividad` handler: parse `ActividadSchema`, call `sesionService.actualizarActividad(lineaProduccionId)`, return 200 with `{ ultimaActividadAt }` or 404. Add `abrirSesionLinea` handler: parse `SesionLineaSchema`; if `req.user.rol === 'visualizacion'` → 403; call `sesionService.obtenerSesionPorUsuario(req.user.id)` — if session exists on a different line → 409 `SESSION_CONFLICT`; call `sesionService.iniciarSesion(lineaProduccionId, req.user.id, req.user.rol)` → return 201 with `SesionActiva`. Confirm 3.3, 3.3b, and 3.4 green.

### 3.6 — GREEN: Update `auth.routes.ts`

- [x] 3.6 In `src/routes/auth.routes.ts`: register `POST /login`, `POST /cerrar-sesion`, `GET /sesion-activa/:lineaId`, `PATCH /actividad`, `POST /sesion-linea` (wired to `abrirSesionLinea` handler). Remove `POST /verificar-pin` and `POST /activar-sesion` registrations entirely (not replaced with 404 stubs — Express will fall through to the 404 handler). Confirm routes serve the expected status codes per tests 3.3, 3.3b, and 3.4.

### 3.7 — GREEN: Remove obsolete `iniciarSesion` route/handler (if any)

- [ ] 3.7 Verify that `POST /iniciar-sesion` (if separately registered) is removed from `auth.routes.ts`. If the route was wired inline within controller, confirm it is gone. Run full test suite: `pnpm test run` — all tests green.

### 3.8 — Final: Reset dev DB and reseed

- [ ] 3.8 Drop and recreate the dev database (or run `mikro-orm migration:fresh`). Run `pnpm ts-node src/seed.ts` (or equivalent seed command). Confirm all 5 users exist with `legajo` and `pinHash`, no `contrasena_hash` column in DB.

---

## Parallel vs Sequential Summary

```
Unit 1 (model/migration/seed) → must complete first (entity shape is a prerequisite)
  └─ Unit 2 (services) → can start immediately after Unit 1
       └─ Unit 3 (controller/routes/schemas) → can start after Unit 2 services are green
Tasks within each unit: sequential (RED before GREEN, ordered by dependency)
```

Tasks 3.3 and 3.4 can be written in parallel (both are RED integration test tasks), then 3.5 makes both green together.
