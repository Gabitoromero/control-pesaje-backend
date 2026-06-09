# Technical Design: Rediseño de Autenticación y Sesiones v1.5 — Backend

**Date:** 2026-06-09
**Artifact store:** openspec (file-based)
**TDD:** Strict (vitest)
**Proposal:** `openspec/changes/rediseno-auth-v1-5-backend/proposal.md`
**Exploration:** `openspec/changes/rediseno-auth-v1-5-backend/exploration.md`

This document is the architectural HOW. It operationalizes the five LOCKED DECISIONS and resolves the six concrete design points (A–F). It does NOT enumerate implementation task steps — that is the `tasks` phase.

---

## Context

v1.5 collapses the v1.4 two-layer auth (Capa 1 user+password → JWT, Capa 2 legajo+PIN → in-memory session) into a single login: **legajo + PIN → JWT 12h**. The deployment threat model is an internal, firewalled plant network; long passwords for operators add friction without real security benefit.

Current code (ground-truth refs from exploration, re-verified):

- `auth.service.ts` — `login()` does password compare against `contrasenaHash`, signs JWT at **20h**; `validatePin()` already does legajo+PIN bcrypt; `hashPassword()` exists.
- `auth.controller.ts` — `login`, `verificarPin`, `activarSesion` (uses `globalSessions` for non-operario), `cerrarSesion` (dual-mode line/global), `getActiveSesion`.
- `sesion.service.ts` — `SesionActiva` with `usuarioIdGlobal` / `usuarioIdUsuario` / `rolUsuario` / `usuarioUltimaActividadAt`; two Maps (`lineSessions`, `globalSessions`); rate limiter keyed by `lineaProduccionId` with **3 strikes → 5 min** (NOTE: proposal locks **5 strikes → 3 min** — see Decision B); lazy-check only for `OPERARIO`.
- `auth.middleware.ts` — `JWTPayload { id, nombreUsuario, rol }`; `puedeTomarMuestrasLibres` is signed but NOT declared (latent mismatch).
- `Usuario.ts` — `legajo` nullable, `pinHash` nullable, `contrasenaHash` NOT NULL.
- Migrations — only `Migration20260527133000.ts` (pasada/muestra). `usuario` table was created by MikroORM schema generation, NO migration exists for it.

Architectural approach: **keep the existing layered shape** (routes → controller → service → MikroORM entity) and the **singleton in-memory session service**. This is a reduction/simplification, not a re-architecture. The discipline is: remove the global-session axis entirely, unify the session shape around a single `usuarioId`, re-home the rate limiter to a login-time key, and fix the JWT contract. No new layers, no new patterns.

---

## Decisions

### Decision A — DB migration strategy & ordering (CRITICAL RISK)

**Problem.** The `usuario` table exists in deployed databases but was never produced by a migration (it came from schema generation). v1.5 must, on existing data:
1. ensure every row has a non-null `pin_hash` and `legajo`,
2. set `legajo` and `pin_hash` to `NOT NULL`,
3. drop `contrasena_hash`.

If ordering is wrong, the migration aborts mid-flight and leaves the schema partially altered.

**Chosen approach: author ONE hand-written MikroORM migration (`up`/`down`), with backfill as an explicit, documented operational gate — NOT an auto-generated value.**

Authoring method: create the migration file manually (do NOT rely on `mikro-orm migration:create` diffing, because the baseline `usuario` schema is not represented by any prior migration, so the diff would be unreliable). Hand-write `addSql` statements in strict order.

**Exact ordered steps inside `up()`:**

1. **Backfill `pin_hash` for NULL rows.** This is the load-bearing safety step. A PIN hash CANNOT be safely auto-generated, because a PIN is a real secret the user must know. Two sub-cases:
   - **Empty table / fresh deploy:** no rows, backfill is a no-op, migration proceeds cleanly. This is the expected case for this project (pre-production).
   - **Existing rows with NULL `pin_hash`:** the migration MUST seed a **known temporary bcrypt hash** for a sentinel PIN (e.g. hash of `"0000"`), and this is an OPERATIONAL DEBT that MUST be rotated. The migration is the wrong place to invent per-user secrets. Statement:
     ```sql
     UPDATE "usuario"
     SET "pin_hash" = '<bcrypt-hash-of-temporary-pin>'
     WHERE "pin_hash" IS NULL;
     ```
     The literal hash is computed once (bcrypt, 10 rounds) and embedded as a constant in the migration. Rotation is a post-deploy operational task, documented in Risks.
2. **Backfill `legajo` for NULL rows.** `legajo` is `UNIQUE`, so a constant cannot be used for multiple rows. Strategy: derive a deterministic unique value from the PK so the `UNIQUE` constraint holds and the value is recognizable as a placeholder:
     ```sql
     UPDATE "usuario"
     SET "legajo" = 'LEG-' || "id"::text
     WHERE "legajo" IS NULL;
     ```
   Like the PIN, placeholder legajos are operational debt to be reconciled. (Fresh deploy: no-op.)
3. **`SET NOT NULL` on `legajo`:**
     ```sql
     ALTER TABLE "usuario" ALTER COLUMN "legajo" SET NOT NULL;
     ```
4. **`SET NOT NULL` on `pin_hash`:**
     ```sql
     ALTER TABLE "usuario" ALTER COLUMN "pin_hash" SET NOT NULL;
     ```
5. **DROP `contrasena_hash`:**
     ```sql
     ALTER TABLE "usuario" DROP COLUMN "contrasena_hash";
     ```

**What fails if order is wrong (document the failure modes):**

- **`SET NOT NULL` before backfill (steps 3/4 before 1/2):** PostgreSQL scans the column and raises `column "pin_hash" contains null values` (SQLSTATE 23502). The `ALTER` aborts; the transaction rolls back. No data corrupted, but the migration is stuck until backfill runs first.
- **DROP `contrasena_hash` before confirming PIN backfill:** drops the only credential some rows had, and if a later `SET NOT NULL` then fails, those rows are now both passwordless AND blocked — recovery requires manual reseeding. So DROP MUST be last.
- **`legajo` backfill with a constant instead of per-row value:** violates the `UNIQUE` constraint (`duplicate key value violates unique constraint`) the moment there is more than one NULL row. Hence the `'LEG-' || id` derivation.

**`down()`** reverses for reversibility: re-add `contrasena_hash` as nullable (cannot restore dropped data — document this in the migration as lossy), drop the `NOT NULL` on `pin_hash` and `legajo`. The placeholder backfills are intentionally NOT reverted (harmless).

**Idempotency note.** Because the table predates migrations, also guard against the migration running where columns may already differ. Keep statements straightforward; MikroORM tracks applied migrations in `mikro_orm_migrations`, so re-runs are prevented at the framework level. Do NOT add defensive `IF EXISTS` gymnastics that hide real drift.

**Entity change paired with the migration:** `Usuario.ts` — remove `contrasenaHash`, change `legajo` and `pinHash` from `nullable: true` to non-nullable (drop the `?` and `nullable` option). `datosAdicionales` stays nullable jsonb (resolves the exploration OPEN QUESTION: KEEP it — out of scope to remove, no v1.5 requirement touches it).

---

### Decision B — Rate-limiter re-key (legajo-keyed)

**Locked semantics (proposal §What Changes):** rate-limit login by **LEGAJO**, **5 attempts → 3-min lock → 429**. NOTE: the current code uses **3 strikes → 5 min**. v1.5 changes BOTH the key and the thresholds. The design adopts 5/3 per the lock.

**Chosen home: keep the limiter in `sesion.service.ts`, re-keyed from `number` (lineaProduccionId) to `string` (legajo).** Rationale:

- The limiter is already a self-contained concern inside the session singleton (`failedAttempts` + `lockExpires` Maps + `registrarIntentoFallido` / `estaBloqueada` / `resetearIntentos`). Moving it to `auth.service.ts` would force `auth.service` to hold mutable in-process state, which it currently does NOT (it is stateless, EM-driven). Keeping login stateless in `auth.service` and limiter-state in the already-stateful session singleton preserves the existing separation: **`auth.service` = credential verification (pure), `sesionService` = in-process runtime state (sessions + throttling).**
- The limiter has no semantic tie to "lines" — it was only keyed by line because that was the old entry point. The key is just an identity bucket; legajo is the correct bucket for login.

**Data structures (re-typed):**
```typescript
private failedAttempts = new Map<string, number>();   // key: legajo
private lockExpires    = new Map<string, Date>();      // key: legajo
```

**Constants:**
```typescript
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 3 * 60 * 1000; // 3 minutes
```

**Method semantics (signatures change number → string):**
- `registrarIntentoFallido(legajo: string)`: increment; when count `>= LOGIN_MAX_ATTEMPTS`, set `lockExpires[legajo] = now + LOGIN_LOCK_MS`.
- `estaBloqueada(legajo: string): boolean`: if `lockExpires[legajo]` is in the future → `true`; if expired → clear lock, reset attempts to 0, return `false`; if absent → `false`.
- `resetearIntentos(legajo: string)`: clear attempts and lock — **called on successful login** (reset-on-success).

**Login flow integration (in `auth.controller.login`):**
1. `if (sesionService.estaBloqueada(legajo)) → 429`.
2. validate credentials via `authService.login(legajo, pin)`.
3. on failure → `sesionService.registrarIntentoFallido(legajo)` → `401`.
4. on success → `sesionService.resetearIntentos(legajo)` → `200 { token }`.

Note: `iniciarSesion` previously called `resetearIntentos(lineaProduccionId)`. After re-key, that call is REMOVED from `iniciarSesion` (the line session no longer owns login throttling). Reset now lives in the login success path keyed by legajo.

**429 response body** (align with existing spec shape, updated wording):
```json
{ "success": false, "error": { "message": "Too many failed login attempts. Try again in 3 minutes." } }
```

---

### Decision C — Session model after `globalSessions` removal

**Final `SesionService` shape.**

`SesionActiva` interface (unified, flat — per typescript skill, one level depth):
```typescript
export interface SesionActiva {
  lineaProduccionId: number | null;
  usuarioId: number | null;        // was usuarioIdUsuario; usuarioIdGlobal DROPPED
  usuarioRol: UsuarioRol | null;   // was rolUsuario
  pasadaId: number | null;
  connectedAt: Date;
  ultimaActividadAt: Date | null;  // was usuarioUltimaActividadAt
}
```

**Maps:**
- `lineSessions: Map<number, SesionActiva>` — **KEEP** (key: lineaProduccionId). This is the ONLY session store.
- `globalSessions: Map<...>` — **REMOVE entirely**.
- `failedAttempts` / `lockExpires` — KEEP, re-keyed to `string` (Decision B).

**Methods — final list:**

| Method | v1.5 disposition |
|---|---|
| `iniciarSesion(lineaProduccionId, usuarioId, usuarioRol)` | **CHANGED**: drop `usuarioIdGlobal` param and the `lineaProduccionId === null` branch. Only line sessions exist. Signature loses the global param; first arg becomes a required `number` (no null path). Returns `IniciarSesionResult` unchanged in shape. Now called by the `abrirSesionLinea` controller handler (backing `POST /api/auth/sesion-linea`) instead of the old operario-only flow. |
| `cerrarSesion(lineaProduccionId)` | KEEP unchanged. |
| `cerrarSesionGlobal` | **REMOVE**. |
| `obtenerSesion(lineaProduccionId)` | KEEP. **Lazy-check change**: replace `usuarioRol === OPERARIO` condition with `usuarioRol === 'operario' \|\| usuarioRol === 'jefe'`. Admin sessions are exempt. Keep the 5-min `OPERATOR_INACTIVITY_MS` window. |
| `obtenerSesionGlobal` | **REMOVE**. |
| `obtenerSesionPorUsuario(usuarioId)` | KEEP; references `session.usuarioId`. Used by `abrirSesionLinea` conflict detection. |
| `actualizarPasada` | KEEP; field rename only. |
| `actualizarActividad(lineaProduccionId)` | KEEP; guards on `usuarioId !== null`; updates `ultimaActividadAt`. Backing method for `PATCH /actividad` (Decision/Locked #4). |
| `registrarIntentoFallido` / `estaBloqueada` / `resetearIntentos` | KEEP, re-keyed to legajo (Decision B). |
| `limpiar()` | KEEP; remove `globalSessions.clear()`. |

**New endpoint: `POST /api/auth/sesion-linea`.**

- **Location**: `auth.controller.ts` (`abrirSesionLinea` handler) + `auth.routes.ts` (new route registration).
- **Schema**: `SesionLineaSchema` in `src/utils/schemas.ts` — `z.object({ lineaProduccionId: z.number().int().positive() })`.
- **Conflict logic**: before calling `iniciarSesion`, the handler calls `obtenerSesionPorUsuario(req.user.id)`. If a session is found on a DIFFERENT line → 409 with `SESSION_CONFLICT`. If same line → allow (idempotent re-open or overwrite per business discretion). If no session → proceed.
- **403 guard**: if `req.user.rol === 'visualizacion'` → 403 before any session lookup.
- **Reuse**: the handler reuses `iniciarSesion` from `sesion.service` (the conflict/403 logic described above is in the controller, not the service — the service method itself is generic). No `pin` verification step; no `usuarioIdGlobal`. This is the direct replacement for the removed `activarSesion` handler.
- **Response**: `201` (or `200`) with `{ success: true, data: <SesionActiva> }`.

**Session model is by LINE CONTEXT, not role.** In v1.5 the ONLY way to create a `lineSessions` entry is via `POST /api/auth/sesion-linea`. Login (`POST /api/auth/login`) NO LONGER creates any session — it only returns a JWT. `activarSesion` (which was the sole creator of jefe/admin global sessions) is DELETED. Any planta user (operario, jefe, or administrador) may call `sesion-linea` to enter a line; the session entry records `usuarioRol` from the JWT. `visualizacion` MUST NOT obtain a line session (403). Jefe and admin who are NOT on a line (menu/dashboard) have NO server session; their inactivity timeout is frontend-only (Decision F).

**Lazy-check role condition — `usuarioRol ∈ {operario, jefe}` (admin exempt).** `obtenerSesion()` MUST apply the 5-min lazy expiry ONLY when the session's `usuarioRol` is `operario` or `jefe`. For `administrador` sessions the lazy check MUST NOT expire the session. The `=== OPERARIO` guard from the old design is replaced with a two-value check: `session.usuarioRol === 'operario' || session.usuarioRol === 'jefe'`. This directly satisfies the spec requirement and avoids the latent bug where a single-value guard silently excludes jefe from expiry.

---

### Decision D — JWT signing & verification

**Signing (`auth.service.login`):**
- Rewrite to `login(legajo: string, pin: string): Promise<string | null>`.
- Find `Usuario` by `{ legajo, activo: true }` (drop the `$or` nombreUsuario/legajo lookup — login is legajo-only now).
- `bcrypt.compare(pin, usuario.pinHash)`; on mismatch or missing user → `null`.
- Sign payload:
  ```typescript
  jwt.sign(
    { id, nombreUsuario, rol, puedeTomarMuestrasLibres },
    secret,
    { expiresIn: '12h' }   // was 20h
  )
  ```
- `puedeTomarMuestrasLibres` is an **explicit boolean** (`usuario.puedeTomarMuestrasLibres` is `boolean` in the entity, default false → always defined).
- `validatePin` becomes redundant for login but may be retained ONLY if some other caller needs it; per scope, login now does the verification inline. `hashPassword` is REMOVED (no password path remains).

**Verification middleware (`auth.middleware.ts`) — fix the latent mismatch:**
```typescript
export interface JWTPayload {
  id: number;
  nombreUsuario: string;
  rol: UsuarioRol;
  puedeTomarMuestrasLibres: boolean;   // NEW — now declared to match what is signed
}
```
No change to `authenticateJWT` / `requireRoles` logic; only the interface gains the boolean claim so the signed token and the verified type agree. This closes the gap where the token carried a claim the type system did not acknowledge.

**Token lifetime note:** 20h → 12h. In-flight tokens issued before deploy outlive the new policy by up to 8h. Accepted (Risks).

---

### Decision E — Test plan (Strict TDD ordering)

Strict TDD: each behavior gets a **failing test first**, then implementation. Ordering below is the red-green sequence. Tests map to source files already present (`backend/src/**/*.test.ts`).

**Test file → changes:**

| Test file | New / changed tests | Covers (Locked / Decision) |
|---|---|---|
| `services/auth.service.test.ts` | REMOVE password-login tests. ADD: PIN login success returns token; bad legajo → null; wrong pin → null; inactive user → null; **decoded JWT asserts `expiresIn` ~12h AND `puedeTomarMuestrasLibres` boolean claim present**. REMOVE `hashPassword` tests. | #1, D |
| `middlewares/auth.middleware.test.ts` | ADD/UPDATE: a token signed with `puedeTomarMuestrasLibres` is accepted and `req.user.puedeTomarMuestrasLibres` is typed/available. | D |
| `services/sesion.service.test.ts` | UPDATE field names → `usuarioId` / `usuarioRol` / `ultimaActividadAt`. REMOVE global-session tests (`iniciarSesion(null,...)`, `obtenerSesionGlobal`, `cerrarSesionGlobal`). ADD: line-session lazy 5-min expiry clears `usuarioId`/`usuarioRol`/`ultimaActividadAt` for operario; same check for jefe (also expires); admin session is NOT expired by lazy check. ADD rate-limiter tests re-keyed to legajo: 5th failure locks; 6th within window blocked; lock expires after 3 min; **reset-on-success clears attempts**. REMOVE any test asserting "non-operario not invalidated" that was scoped to jefe — jefe IS subject to expiry on a line. | #2, #3, #5, B, C |
| `api.test.ts` | REMOVE the 2FA / `verificar-pin` / `activar-sesion` block. ADD: `POST /api/auth/login` legajo+PIN happy path (200, token); wrong pin → 401; inactive → 401; **legajo rate-limit: 5 fails then 429**. ADD: `POST /api/auth/verificar-pin` → 404 (route removed); `POST /api/auth/activar-sesion` → 404. ADD: `POST /api/auth/sesion-linea` → 201 (operario); 201 (jefe); 403 (visualizacion); 409 (same user different line); 401 (no JWT); 400 (bad body). ADD: `PATCH /api/auth/actividad` → **200 when line session exists, 404 when none, 401 without JWT**. ADD: simplified `cerrar-sesion`. UPDATE `sesion-activa/:lineaId` response to unified shape (no `usuarioIdGlobal`). | #1, #2, #4, #5 |
| `models.test.ts` | UPDATE `Usuario` shape: `legajo`/`pinHash` required; no `contrasenaHash`. | A |
| schema tests (in `api.test.ts` or a `schemas` test) | ADD: `LoginSchema` requires legajo+pin; `ActividadSchema` requires `lineaProduccionId`; `UsuarioCreateSchema` requires legajo+pin, rejects/ignores `contrasena`. Removed schemas no longer importable. | #1, #4 |

**Locked-decision → covering test (traceability):**
- #1 single-layer login + boolean claim → `auth.service.test.ts` (claim + 12h), `api.test.ts` (login happy/fail).
- #2 remove globalSessions, operario-only session → `sesion.service.test.ts` (global tests removed; line-only), `api.test.ts` (no jefe session created).
- #3 `SesionActiva` unified → `sesion.service.test.ts` field-rename assertions.
- #4 `PATCH /actividad` 200/404/401 + operario lazy expiry → `api.test.ts` actividad block; `sesion.service.test.ts` lazy-expiry.
- #5 rate-limit by legajo 5→3min→429 → `sesion.service.test.ts` limiter + `api.test.ts` 429.

**Red-green order (high level):** (1) entity + migration (model test red→green), (2) `auth.service` PIN login + 12h + claim, (3) `JWTPayload` claim, (4) `SesionActiva` rename + global removal, (5) legajo limiter + reset-on-success, (6) controller/routes: login rewrite, delete verificar-pin/activar-sesion, simplify cerrar-sesion/getActiveSesion, add `PATCH /actividad`, (7) schemas, (8) seed + usuario.service cleanup.

---

### Decision F — Security note (jefe timeout is frontend-only)

**Documented and accepted.** Jefe/admin have NO server-side session in v1.5. Their 5-minute inactivity logout is enforced **only by the frontend** (interval + modal). Server-side, the JWT remains valid for its full **12h** lifetime regardless of frontend inactivity. Consequences:

- A jefe JWT stolen/replayed within 12h is accepted by the backend even if the frontend would have "logged out" the user after 5 min. The backend has no way to know the frontend timer fired (no server session to invalidate).
- This is acceptable **strictly because of the threat model**: the plant runs on an internal, firewalled network; the server rejects external connections at the firewall. The attack surface for token replay is physical/internal, not internet-facing. Operators' line sessions (the higher-churn, shared-terminal case) DO get server-side lazy expiry; jefe/admin (individual, lower-risk consoles) rely on the frontend.
- Operario is different: the operario line session is server-tracked and lazily expired at 5 min, because a shared production-line terminal left unattended is the real operational risk this protects against.

This is an explicit, recorded tradeoff — NOT an oversight.

---

## Migration Plan (explicit, ordered)

New file: `backend/src/migrations/Migration<timestamp>_AuthV15.ts` (hand-written, extends MikroORM `Migration`).

`up()` — statements in EXACT order:

```sql
-- 1. Backfill pin_hash (no-op on empty table; sentinel hash on legacy rows — ROTATE post-deploy)
UPDATE "usuario" SET "pin_hash" = '<bcrypt(temporary-pin,10)>' WHERE "pin_hash" IS NULL;

-- 2. Backfill legajo with per-row unique placeholder (no-op on empty table)
UPDATE "usuario" SET "legajo" = 'LEG-' || "id"::text WHERE "legajo" IS NULL;

-- 3. legajo NOT NULL
ALTER TABLE "usuario" ALTER COLUMN "legajo" SET NOT NULL;

-- 4. pin_hash NOT NULL
ALTER TABLE "usuario" ALTER COLUMN "pin_hash" SET NOT NULL;

-- 5. drop contrasena_hash (LAST)
ALTER TABLE "usuario" DROP COLUMN "contrasena_hash";
```

`down()` (lossy, documented):
```sql
ALTER TABLE "usuario" ADD COLUMN "contrasena_hash" varchar(255) NULL;
ALTER TABLE "usuario" ALTER COLUMN "pin_hash" DROP NOT NULL;
ALTER TABLE "usuario" ALTER COLUMN "legajo" DROP NOT NULL;
```

Paired entity edit (`Usuario.ts`): remove `contrasenaHash`; `legajo` and `pinHash` become non-nullable (`@Property({ type: 'string', length: 50 })` / `length: 255`, no `nullable`).

Seed (`seed.ts`): stop generating `contrasenaHash`; guarantee `legajo` + `pinHash` for all 5 users.

`usuario.service.ts` `mapCredentials`: remove the `contrasena → contrasenaHash` branch; keep `pin → pinHash`.

---

## Test Plan

(See Decision E for full mapping.) Summary of files touched and red-green order:

1. `models.test.ts` + `Usuario.ts` + migration.
2. `services/auth.service.test.ts` + `auth.service.ts` (PIN login, 12h, boolean claim; remove password + hashPassword).
3. `middlewares/auth.middleware.test.ts` + `auth.middleware.ts` (declare claim).
4. `services/sesion.service.test.ts` + `sesion.service.ts` (rename, remove global, role-agnostic lazy expiry, legajo limiter, reset-on-success).
5. `api.test.ts` + `auth.controller.ts` + `auth.routes.ts` (login rewrite; delete verificar-pin/activar-sesion → 404; simplify cerrar-sesion/getActiveSesion; add PATCH /actividad 200/404/401; add POST /sesion-linea 201/403/409/401/400; 429 limiter).
6. Schema tests + `utils/schemas.ts` (`LoginSchema` legajo+pin, `ActividadSchema`, `SesionLineaSchema`; remove VerificarPin/ActivarSesion) + `shared/schemas.ts` (`UsuarioCreateSchema`).
7. `seed.ts` + `usuario.service.ts` cleanup.

Strict TDD: write/adjust the failing test BEFORE each implementation edit. Run `pnpm test run` to confirm red, implement, confirm green.

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Migration aborts on legacy rows with NULL `pin_hash`/`legajo` | CRITICAL | Backfill-first ordering (steps 1–2 before NOT NULL); per-row unique legajo placeholder to respect UNIQUE; DROP last. Failure modes documented in Decision A. |
| Sentinel PIN hash left in production (security) | HIGH | The temporary PIN is a known constant — recorded as operational debt; rotation is a mandatory post-deploy step. Fresh deploys (this project's expected state) have zero legacy rows, so no sentinel is written. |
| `legajo` UNIQUE collision during backfill | MED | Use `'LEG-' || id` (PK-derived, guaranteed unique). |
| In-flight 20h tokens outlive new 12h policy | LOW | Accepted; internal network; short-lived plant sessions. No token revocation list in scope. |
| Threshold drift (code was 3/5, lock is 5/3) | MED | Design explicitly adopts 5 attempts / 3 min per the LOCKED decision; tests assert the new numbers to prevent regression to old values. |
| Frontend-only jefe timeout = 12h server-valid token | ACCEPTED | Justified by internal/firewalled threat model (Decision F). Recorded tradeoff. |
| Removing routes breaks frontend still calling Capa 2 | MED | Coordinated via the chained frontend proposal; out of scope here, but removed routes return 404 (tested). |

---

## Open Questions

None blocking. Resolved during design:
- `datosAdicionales` jsonb → **KEEP** (nullable; no v1.5 requirement removes it).
- `puedeTomarMuestrasLibres` in JWT → **KEEP and DECLARE** in `JWTPayload` (Decision D).
- Rate-limiter home → **`sesion.service.ts`, re-keyed to legajo** (Decision B).
- Jefe/admin in-memory session → **none; JWT only** (Decision C/F).

One operational item (not a code question): the exact temporary-PIN bcrypt literal for the migration must be generated once and embedded. Only relevant if deploying onto a non-empty `usuario` table.
