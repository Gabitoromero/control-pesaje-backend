# Progress Report: PR 1 & PR 2 (Two-Layer 2FA Authentication & Docker MVP)

Completed implementation of PR 1 and PR 2 for the change **auth-two-layer-docker-mvp** following the specifications in `tasks.md` and `spec.md`.

---

## 1. Accomplishments

### PR 1: Docker Setup & Database Seeding

#### Task 1.1: Dockerfile Construction
- Created an optimized multi-stage `Dockerfile` in the backend root using **Node 20 alpine**.
- **Stage 1 (Builder):** Installs development dependencies and compiles TypeScript into `dist/src/` via `tsc`.
- **Stage 2 (Runner):** Copies only compiled assets and production dependencies. Runs via `node dist/src/index.js`.
- Added `.dockerignore` to prevent host files and local `node_modules`/`dist` from inflating the build context.

#### Task 1.2: Docker Compose Unified Configuration
- Updated `docker-compose.yaml` with `postgres` and `backend` services on a shared bridge network (`pesaje_net`).
- Added `pg_isready` healthcheck on `postgres`; `backend` depends on `condition: service_healthy`.
- Exposes port `3000` (API) and `5433` (database) externally.

#### Task 1.3: Database Seeding Script
- Implemented `src/seed.ts` using MikroORM `orm.schema` to drop and recreate schema for office testing.
- Inserts: 1 Admin, 1 Jefe, 3 Operarios (PINs: 1111/2222/3333), 3 Lineas, 4 Etapas, 2 Rutas, 3 Articulos.
- Added `"seed"` script to `package.json`.

---

### PR 2: 2FA Authentication Services & Endpoints

#### Task 2.1: Zod Schemas Validation Definition
- `LoginSchema`, `ActivarSesionSchema` (PIN regex `^\d{4,6}$`), `CerrarSesionOperarioSchema` defined in `src/utils/schemas.ts`.
- Routes import schemas from the utility file.

#### Task 2.2: SesionService Implementation (Timeout, Rate Limit, Exclusivity)
- `ActiveSession` interface: `lineaProduccionId`, `usuarioIdGlobal`, `usuarioIdOperario | null`, `pasadaId | null`, `connectedAt`, `operarioUltimaActividadAt | null`.
  - **`articuloId` is NOT part of the session** — it belongs to the `Pasada`, not the session.
- `iniciarSesion` returns `IniciarSesionResult`: `{ ok: true, session }` or `{ ok: false, conflict: { lineaProduccionId } }`.
  - Detects if the operator already has an active session on another line and returns conflict instead of silently evicting.
- **Inactivity timeout (5 min):** `obtenerSesion` invalidates `usuarioIdOperario = null` and `operarioUltimaActividadAt = null` after 5 minutes.
- **Rate limiting:** 3 consecutive failed PIN attempts trigger a 5-minute lockout per line. Resets on successful activation.

#### Task 2.3: Two-Layer API Endpoints Development
- `POST /api/auth/login`: validates credentials (admin/jefe only), returns 8-hour JWT.
- `POST /api/auth/activar-sesion-operario`: requires JWT, validates PIN, verifies line exists, starts in-memory session.
  - Returns `409 Conflict` with `code: OPERATOR_SESSION_CONFLICT` and `data.lineaProduccionId` when operator already has a session on another line. Frontend must offer: (A) close other session and retry, or (B) cancel.
  - Does NOT resolve `articuloId` — removed `ArticuloRutaPasada` query.
- `POST /api/auth/cerrar-sesion-operario`: requires JWT, terminates operator session.
- `GET /api/auth/sesion-activa/:lineaId`: requires JWT, returns active session or `null`.

#### Task 2.4: Comprehensive Integration & Service Tests
- `src/services/sesion.service.test.ts`: 9 tests covering session open, conflict detection, explicit close + reopen, session close, lookup by user, pasada update, operator timeout, activity reset, rate limiting, and failed attempt reset.
- `src/api.test.ts`: 7 integration tests covering activation success, blocking (429), invalid PIN (404), operator session conflict (409), session close, null session, and session details.
- **All 65 tests pass** across 7 test files.

---

## 2. Verification Status

| Action | Command | Status | Notes |
|--------|---------|--------|-------|
| Compilation | `pnpm build` | Pending re-run | No TypeScript errors expected. |
| Test Suite | `pnpm test run` | **SUCCESS** | 65 tests across 7 files, all green. |

---

## 3. Key Design Decisions (this session)

- **`articuloId` removed from `ActiveSession`**: article belongs to `Pasada`, not to the operator session. Clients query the active pasada for article context.
- **Operator exclusivity via 409 instead of silent eviction**: `iniciarSesion` returns a typed conflict result; the controller surfaces it as HTTP 409 so the frontend can present an explicit choice to the user.
- **`PasadaService.iniciarPasada`**: removed `articuloId` session validation; only operator identity is validated against the session.
