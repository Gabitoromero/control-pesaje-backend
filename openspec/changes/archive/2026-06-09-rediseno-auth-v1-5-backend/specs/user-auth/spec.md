# user-auth Delta Specification — rediseno-auth-v1-5-backend

## Purpose

This delta spec defines what MUST be true in the `user-auth` domain after the v1.5 auth redesign is applied.
It supersedes the two-layer authentication model defined in the baseline spec at `openspec/specs/user-auth/spec.md`.

Requirements marked **REMOVED** are deleted without replacement.
Requirements marked **MODIFIED** replace their counterpart in the baseline spec.
Requirements marked **ADDED** are new and have no counterpart in the baseline spec.

The baseline requirements **JWT Verification Middleware**, **Role Guard Authorization**, and **Especificación del Contenedor Docker (MVP Oficina)** are carried forward unchanged and are NOT listed here.

---

## REMOVED Requirements

### Requirement: User Authentication Endpoint (Capa 1 - Login Global) — REMOVED

The `POST /api/auth/login` endpoint that accepted `{ nombreUsuario, contrasena }` and validated against `contrasenaHash` (bcrypt) is **eliminated**.
The Zod schema `LoginSchema` (v1.4 shape with `nombreUsuario` + `contrasena`) is **eliminated**.

### Requirement: Activación de Sesión Operativa (Capa 2) — REMOVED

The endpoint `POST /api/auth/activar-sesion-operario` and its associated Zod schema `ActivarSesionSchema` (v1.4: `{ pin, lineaProduccionId }`) are **eliminated**.
The concept of a separate PIN verification step after a global login no longer exists.

### Requirement: Verificar PIN (Capa 2) — REMOVED

The endpoint `POST /api/auth/verificar-pin` and its Zod schema `VerificarPinSchema` are **eliminated**.

### Requirement: Global Session Map — REMOVED

The in-memory `Map` named `globalSessions` (storing jefe/admin sessions keyed by user id) and all methods that interact with it (`cerrarSesionGlobal`, `obtenerSesionGlobal`, `iniciarSesionGlobal`) are **eliminated**.
`iniciarSesion` MUST NOT populate `usuarioIdGlobal`.

### Requirement: contrasenaHash on usuario model — REMOVED

The `contrasena_hash` column on the `usuario` table is **eliminated**.
The `hashPassword` utility and any login branch that reads `contrasenaHash` in `auth.service.ts` are **eliminated**.
The `contrasena` field in `UsuarioCreateSchema` is **eliminated**.

---

## MODIFIED Requirements

### Requirement: User Authentication Endpoint — Unified Login (MODIFIED)

The system MUST expose a single login endpoint at `POST /api/auth/login` that accepts `{ legajo, pin }`.

- `legajo` MUST be a non-empty string.
- `pin` MUST be a string of 4–6 numeric digits.
- The system MUST look up the user by `legajo`. If no user is found, it MUST return 401.
- The system MUST verify `pin` against the stored `pinHash` using bcrypt. If verification fails, the attempt MUST be counted against the rate-limit bucket keyed by `legajo`.
- Inactive users (`activo = false`) MUST NOT be allowed to authenticate and MUST return 401.
- On success, the system MUST emit a **signed JWT valid for 12 hours** containing the claims described in the JWT Payload requirement below.
- On success, the system MUST return `{ "success": true, "data": { "token": "<jwt>" } }`.
- The Zod schema for the request body is `LoginSchema` (v1.5):
  ```typescript
  const LoginSchema = z.object({
    legajo: z.string().min(1),
    pin: z.string().regex(/^\d{4,6}$/),
  });
  ```
- **Responses:**
  - `200 OK`: `{ "success": true, "data": { "token": "eyJhbGciOi..." } }`
  - `401 Unauthorized` (wrong pin, unknown legajo, or inactive): `{ "success": false, "error": { "message": "Invalid credentials or inactive user" } }`
  - `400 Bad Request` (Zod validation failure): `{ "success": false, "error": { "message": "Validation failed", "details": [...] } }`
  - `429 Too Many Requests` (rate-limit exceeded): `{ "success": false, "error": { "message": "Too many failed attempts. Try again in 3 minutes." } }`

#### Scenario: Successful unified login — happy path
- GIVEN a user exists with `legajo: "12345"`, a valid `pinHash`, and `activo: true`
- WHEN `POST /api/auth/login` is called with `{ legajo: "12345", pin: "1234" }` and the pin matches
- THEN the system MUST return `200 OK` with `{ "success": true, "data": { "token": "<jwt>" } }`
- AND the JWT MUST expire in 12 hours from issuance
- AND the JWT payload MUST include `id`, `nombreUsuario`, `rol`, and `puedeTomarMuestrasLibres` as a boolean

#### Scenario: Login rejected — unknown legajo
- GIVEN no user exists with `legajo: "99999"`
- WHEN `POST /api/auth/login` is called with `{ legajo: "99999", pin: "1234" }`
- THEN the system MUST return `401 Unauthorized`

#### Scenario: Login rejected — wrong pin
- GIVEN a user exists with `legajo: "12345"` and `activo: true`
- WHEN `POST /api/auth/login` is called with an incorrect `pin`
- THEN the system MUST return `401 Unauthorized`
- AND the failed-attempt counter for `legajo: "12345"` MUST be incremented

#### Scenario: Login rejected — inactive user
- GIVEN a user exists with `legajo: "12345"` and `activo: false`
- WHEN `POST /api/auth/login` is called with correct credentials
- THEN the system MUST return `401 Unauthorized`

#### Scenario: Login body fails Zod validation
- GIVEN a request body with `pin: "abc"` (non-numeric)
- WHEN `POST /api/auth/login` is called
- THEN the system MUST return `400 Bad Request` with a `details` array

### Requirement: Login Rate Limiting Keyed by Legajo (MODIFIED)

The system MUST enforce a per-`legajo` rate limit on `POST /api/auth/login`.

- **Bucket key**: `legajo` value from the request body (NOT `lineaProduccionId`).
- **Threshold**: 5 consecutive failed login attempts.
- **Lockout duration**: 3 minutes.
- A successful login MUST reset the failed-attempt counter for that `legajo`.
- While the bucket is locked, ALL login attempts for that `legajo` MUST return `429 Too Many Requests` without hitting the database.

#### Scenario: Lockout after 5 failed attempts
- GIVEN a user with `legajo: "12345"` has failed login 5 times consecutively
- WHEN a 6th `POST /api/auth/login` attempt is made with `legajo: "12345"`
- THEN the system MUST return `429 Too Many Requests`
- AND no database query MUST be executed for that attempt

#### Scenario: Counter resets after successful login
- GIVEN a user with `legajo: "12345"` has failed 3 consecutive times
- WHEN a correct `POST /api/auth/login` is made with `legajo: "12345"`
- THEN the system MUST return `200 OK`
- AND the failed-attempt counter for `legajo: "12345"` MUST be reset to 0

#### Scenario: Lockout expires after 3 minutes
- GIVEN a user with `legajo: "12345"` is locked out
- WHEN 3 minutes have elapsed
- THEN the system MUST allow a new login attempt for `legajo: "12345"`

### Requirement: JWT Payload Claims (MODIFIED)

The signed JWT MUST include the following typed claims:

```typescript
interface JWTPayload {
  id: number;
  nombreUsuario: string;
  rol: Rol;
  puedeTomarMuestrasLibres: boolean;
}
```

- `puedeTomarMuestrasLibres` MUST be explicitly typed as `boolean` in the `JWTPayload` interface (fixing the v1.4 implicit `any` latent type mismatch).
- The `authenticateJWT` middleware MUST expose all four claims on `req.user`.

#### Scenario: JWT contains puedeTomarMuestrasLibres as boolean
- GIVEN a user with `puedeTomarMuestrasLibres: true` authenticates successfully
- WHEN the issued JWT is decoded
- THEN `payload.puedeTomarMuestrasLibres` MUST be `true` (boolean, not string, not absent)

#### Scenario: JWT contains puedeTomarMuestrasLibres false for standard user
- GIVEN a user with `puedeTomarMuestrasLibres: false` authenticates successfully
- WHEN the issued JWT is decoded
- THEN `payload.puedeTomarMuestrasLibres` MUST strictly equal `false`

### Requirement: Cierre de Sesión (Simplified — MODIFIED)

The endpoint `POST /api/auth/cerrar-sesion` MUST close the operario line session for the given `lineaProduccionId`.

- **Auth**: JWT required.
- **Request Body (Zod: `CerrarSesionSchema`)**: `{ lineaProduccionId: number }`.
- There is NO global session to close. The endpoint MUST only clear the line session from the in-memory `lineSessions` map.
- **Responses:**
  - `200 OK`: `{ "success": true, "data": { "message": "Session closed successfully" } }`
  - `400 Bad Request` (no active session for that line): `{ "success": false, "error": { "message": "No active session found for this line" } }`
  - `401 Unauthorized` (missing or invalid JWT): standard 401 envelope

#### Scenario: Successful session close for operario line
- GIVEN an operario has an active line session on `lineaProduccionId: 3`
- WHEN `POST /api/auth/cerrar-sesion` is called with `{ lineaProduccionId: 3 }` and a valid JWT
- THEN the system MUST remove the session from `lineSessions`
- AND return `200 OK` with the success message

#### Scenario: Close session — no session exists
- GIVEN no active line session exists for `lineaProduccionId: 3`
- WHEN `POST /api/auth/cerrar-sesion` is called with `{ lineaProduccionId: 3 }` and a valid JWT
- THEN the system MUST return `400 Bad Request`

#### Scenario: Close session — missing JWT
- GIVEN a request with no `Authorization` header
- WHEN `POST /api/auth/cerrar-sesion` is called
- THEN the system MUST return `401 Unauthorized`

### Requirement: Obtener Sesión Activa — Unified SesionActiva Shape (MODIFIED)

The endpoint `GET /api/auth/sesion-activa/:lineaId` MUST return the current line session state using the unified `SesionActiva` shape.

- **Auth**: JWT required.
- The unified `SesionActiva` shape is:
  ```typescript
  interface SesionActiva {
    lineaProduccionId: number;
    usuarioId: number | null;
    usuarioRol: Rol | null;
    pasadaId: number | null;
    connectedAt: Date;
    ultimaActividadAt: Date | null;
  }
  ```
- Fields dropped from v1.4: `usuarioIdGlobal`, `usuarioIdUsuario`, `rolUsuario`, `usuarioUltimaActividadAt`.
- If the operario session has expired (lazy timeout check), `usuarioId` MUST be `null` and `ultimaActividadAt` MUST be `null`.
- **Responses:**
  - `200 OK`:
    ```json
    {
      "success": true,
      "data": {
        "lineaProduccionId": 1,
        "usuarioId": 5,
        "usuarioRol": "operario",
        "pasadaId": null,
        "connectedAt": "2026-06-09T10:00:00Z",
        "ultimaActividadAt": "2026-06-09T10:04:00Z"
      }
    }
    ```
  - `404 Not Found` (no session exists for that line): `{ "success": false, "error": { "message": "No session found for this line" } }`
  - `401 Unauthorized` (missing or invalid JWT)

#### Scenario: Returns unified SesionActiva for active operario
- GIVEN an operario line session exists for `lineaId: 1` with `usuarioId: 5`, `usuarioRol: "operario"`, and activity within the last 5 minutes
- WHEN `GET /api/auth/sesion-activa/1` is called with a valid JWT
- THEN the response MUST contain `usuarioId`, `usuarioRol`, `ultimaActividadAt`
- AND the response MUST NOT contain `usuarioIdGlobal`, `usuarioIdUsuario`, `rolUsuario`, or `usuarioUltimaActividadAt`

#### Scenario: Returns expired session with null user fields
- GIVEN an operario line session exists for `lineaId: 1` but `ultimaActividadAt` is more than 5 minutes ago
- WHEN `GET /api/auth/sesion-activa/1` is called with a valid JWT
- THEN the system MUST trigger the lazy expiry check
- AND return `200 OK` with `usuarioId: null` and `ultimaActividadAt: null`

#### Scenario: Returns 404 when no session exists for line
- GIVEN no line session exists for `lineaId: 99`
- WHEN `GET /api/auth/sesion-activa/99` is called with a valid JWT
- THEN the system MUST return `404 Not Found`

### Requirement: usuario Model v1.5 (MODIFIED)

The `usuario` entity MUST conform to the v1.5 schema:

- `contrasena_hash` (`contrasenaHash`) column MUST NOT exist.
- `legajo` MUST be `NOT NULL` and `UNIQUE`.
- `pin_hash` (`pinHash`) MUST be `NOT NULL`.
- `datos_adicionales` (jsonb) is retained as-is (nullable is acceptable for this field only).
- No other column changes are required.

The DB migration MUST follow this order to avoid constraint violations on existing rows:
1. Backfill `pin_hash` for any rows where it is null.
2. Apply `legajo NOT NULL` and `pin_hash NOT NULL` constraints.
3. Drop `contrasena_hash`.

#### Scenario: usuario persist without contrasenaHash
- GIVEN a new user is created with valid `legajo`, `pinHash`, `nombreUsuario`, and `rol`
- WHEN the user is saved to the database
- THEN the operation MUST succeed
- AND the resulting row MUST NOT contain a `contrasena_hash` column value

#### Scenario: usuario persist fails when legajo is null
- GIVEN a new user payload with `legajo: null`
- WHEN the user is saved to the database
- THEN the operation MUST fail with a NOT NULL constraint violation

#### Scenario: usuario persist fails when pinHash is null
- GIVEN a new user payload with `pinHash: null`
- WHEN the user is saved to the database
- THEN the operation MUST fail with a NOT NULL constraint violation

### Requirement: UsuarioCreateSchema v1.5 (MODIFIED)

The Zod schema `UsuarioCreateSchema` MUST be updated:

- `contrasena` field MUST be removed.
- `legajo` MUST be required and non-empty.
- `pin` (plain PIN before hashing) MUST be required and match `/^\d{4,6}$/`.
- `usuario.service.mapCredentials` MUST hash `pin` into `pinHash` and MUST NOT produce `contrasenaHash`.

#### Scenario: UsuarioCreateSchema rejects missing legajo
- GIVEN a create-user payload without `legajo`
- WHEN parsed through `UsuarioCreateSchema`
- THEN Zod MUST return a validation error on the `legajo` field

#### Scenario: UsuarioCreateSchema rejects non-numeric pin
- GIVEN a create-user payload with `pin: "abcd"`
- WHEN parsed through `UsuarioCreateSchema`
- THEN Zod MUST return a validation error on the `pin` field

---

## ADDED Requirements

### Requirement: PATCH /api/auth/actividad — Reset Line Session Activity

The system MUST expose `PATCH /api/auth/actividad` to reset the `ultimaActividadAt` timestamp of an active operario line session.

- **Auth**: JWT required.
- **Request Body (Zod: `ActividadSchema`)**: `{ lineaProduccionId: number }`.
- **Scope**: This endpoint applies ONLY to operario line sessions managed in the `lineSessions` in-memory map. It MUST NOT create a new session.
- **Responses:**
  - `200 OK` (session exists and timestamp was reset): `{ "success": true, "data": { "ultimaActividadAt": "<iso-string>" } }`
  - `404 Not Found` (no active line session for that `lineaProduccionId`): `{ "success": false, "error": { "message": "No active session found for this line" } }`
  - `401 Unauthorized` (missing or invalid JWT)

#### Scenario: Activity reset — happy path
- GIVEN an active line session exists for `lineaProduccionId: 2`
- WHEN `PATCH /api/auth/actividad` is called with `{ lineaProduccionId: 2 }` and a valid JWT
- THEN the system MUST update `ultimaActividadAt` in the `lineSessions` map to approximately `Date.now()`
- AND return `200 OK` with the new `ultimaActividadAt` value

#### Scenario: Activity reset — no session exists
- GIVEN no active line session exists for `lineaProduccionId: 2`
- WHEN `PATCH /api/auth/actividad` is called with `{ lineaProduccionId: 2 }` and a valid JWT
- THEN the system MUST return `404 Not Found`

#### Scenario: Activity reset — missing JWT
- GIVEN a request to `PATCH /api/auth/actividad` with no `Authorization` header
- WHEN the request is received
- THEN the `authenticateJWT` middleware MUST return `401 Unauthorized`

#### Scenario: Activity reset — body fails validation
- GIVEN a request body with `lineaProduccionId: "abc"` (non-numeric)
- WHEN `PATCH /api/auth/actividad` is called
- THEN the system MUST return `400 Bad Request` with a Zod validation error

### Requirement: In-Memory Line Session Scope

The in-memory `lineSessions` map holds one session per active production line. A session is created when ANY planta user (operario, jefe, or administrador) enters a line — membership is by LINE CONTEXT, not role.

- A `lineSessions` entry is created ONLY by `POST /api/auth/sesion-linea`, never automatically on login. On login NO entry is created for any role.
- `visualizacion` MUST NOT obtain a line session (no planta access).
- The 5-minute lazy inactivity check in `obtenerSesion()` MUST apply ONLY when the session's `usuarioRol` is `operario` or `jefe`. For `administrador` sessions the lazy check MUST NOT expire the session.
- When a jefe or admin is NOT on a line (menu/dashboard), there is NO server session; the jefe inactivity timeout is frontend-only; admin has no timeout.

#### Scenario: Login does not create a line session for any role
- GIVEN a user with any role authenticates via `POST /api/auth/login`
- WHEN the login succeeds and the JWT is issued
- THEN `lineSessions` MUST NOT contain any entry for that user, regardless of role

#### Scenario: Operario opens a line session via sesion-linea
- GIVEN a user with `rol: "operario"` holds a valid JWT
- WHEN `POST /api/auth/sesion-linea` is called with `{ lineaProduccionId: 1 }`
- THEN `lineSessions` MUST contain an entry keyed by `1` with `usuarioId` set to the operario's id and `usuarioRol: "operario"`

#### Scenario: Jefe on a line with activity >5 min ago expires (jefe IS subject to timeout on a line)
- GIVEN a jefe line session in `lineSessions` with `ultimaActividadAt` more than 5 minutes ago
- WHEN `obtenerSesion(lineaProduccionId)` is called
- THEN the system MUST clear `usuarioId` and `ultimaActividadAt` from that session entry (lazy expiry applies to jefe)

#### Scenario: Admin on a line with activity >5 min ago is NOT expired (admin exempt)
- GIVEN an administrador line session in `lineSessions` with `ultimaActividadAt` more than 5 minutes ago
- WHEN `obtenerSesion(lineaProduccionId)` is called
- THEN the system MUST leave the session intact — `usuarioId` and `ultimaActividadAt` MUST remain unchanged

### Requirement: Open Line Session — POST /api/auth/sesion-linea (ADDED)

The system MUST expose `POST /api/auth/sesion-linea` to open an in-memory line session for an authenticated planta user.

- Replaces the v1.4 PIN-based `activar-sesion` step. Identity is already proven by the JWT, so NO pin is required in the body.
- **Auth**: JWT required.
- **Request Body (Zod: `SesionLineaSchema`)**: `{ lineaProduccionId: z.number().int().positive() }`.
- **Behavior**: create a `lineSessions` entry keyed by `lineaProduccionId` with `usuarioId = req.user.id`, `usuarioRol = req.user.rol`, `connectedAt = now`, `ultimaActividadAt = now`, `pasadaId = null`. Return the unified `SesionActiva`.
- **403 Forbidden** if `req.user.rol` is `visualizacion` (no planta access).
- **409 Conflict** if the same `usuarioId` already holds a session on a DIFFERENT line:
  ```json
  { "success": false, "error": { "code": "SESSION_CONFLICT", "message": "User already has an active session on another line", "data": { "lineaProduccionId": <existing-line-id> } } }
  ```
- **Responses:**
  - `201 Created` (or `200 OK`) with `{ "success": true, "data": <SesionActiva> }`
  - `400 Bad Request` (Zod validation failure)
  - `401 Unauthorized` (missing or invalid JWT)
  - `403 Forbidden` (visualizacion role)
  - `409 Conflict` (same user already on a different line)

#### Scenario: Operario opens a line session — happy path
- GIVEN a user with `rol: "operario"` holds a valid JWT and no existing line session
- WHEN `POST /api/auth/sesion-linea` is called with `{ lineaProduccionId: 1 }`
- THEN the system MUST return `201` (or `200`) with `{ "success": true, "data": <SesionActiva> }`
- AND `lineSessions` MUST contain an entry for line `1` with the operario's `usuarioId` and `usuarioRol: "operario"`

#### Scenario: Jefe opens a line session
- GIVEN a user with `rol: "jefe"` holds a valid JWT and no existing line session
- WHEN `POST /api/auth/sesion-linea` is called with `{ lineaProduccionId: 2 }`
- THEN the system MUST return `201` (or `200`) with a valid `SesionActiva`
- AND `lineSessions` MUST contain an entry for line `2` with `usuarioRol: "jefe"`

#### Scenario: Visualizacion role is rejected
- GIVEN a user with `rol: "visualizacion"` holds a valid JWT
- WHEN `POST /api/auth/sesion-linea` is called with any body
- THEN the system MUST return `403 Forbidden`

#### Scenario: Same user already on a different line — 409 conflict
- GIVEN a user already holds a session on `lineaProduccionId: 3`
- WHEN `POST /api/auth/sesion-linea` is called with `{ lineaProduccionId: 5 }`
- THEN the system MUST return `409 Conflict` with `{ "error": { "code": "SESSION_CONFLICT", "data": { "lineaProduccionId": 3 } } }`

#### Scenario: Missing JWT — 401
- GIVEN a request with no `Authorization` header
- WHEN `POST /api/auth/sesion-linea` is called
- THEN the system MUST return `401 Unauthorized`

#### Scenario: Non-numeric lineaProduccionId — 400
- GIVEN a request body with `{ "lineaProduccionId": "abc" }`
- WHEN `POST /api/auth/sesion-linea` is called with a valid JWT
- THEN the system MUST return `400 Bad Request` with a Zod validation error

### Requirement: Removed Endpoints Return 404

The endpoints `POST /api/auth/verificar-pin` and the old `POST /api/auth/activar-sesion` MUST NOT be registered on the Express router after v1.5 is applied. `POST /api/auth/sesion-linea` is the v1.5 replacement for the line-session-opening behavior.

#### Scenario: POST /api/auth/verificar-pin returns 404
- GIVEN the v1.5 auth router is loaded
- WHEN `POST /api/auth/verificar-pin` is called with any body
- THEN the system MUST return `404 Not Found`

#### Scenario: POST /api/auth/activar-sesion returns 404
- GIVEN the v1.5 auth router is loaded
- WHEN `POST /api/auth/activar-sesion` is called with any body
- THEN the system MUST return `404 Not Found`
