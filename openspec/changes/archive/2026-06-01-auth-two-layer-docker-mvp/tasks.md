# Tasks: Autenticación en Dos Capas & Docker MVP

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~350-450 lines |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes (2 PRs) |
| Suggested split | PR 1 (Docker Setup & DB Seeding) → PR 2 (2FA API & Tests) |

---

## PR 1: Docker Setup & Database Seeding

### Task 1.1: Dockerfile Construction
* **Description**: Create a multi-stage Dockerfile using Node 20 alpine to build TypeScript code and optimize the production image size.
* **Criterios de Aceptación**:
  - `Dockerfile` exists in the root directory.
  - Multi-stage build compiled TypeScript (`dist/`).
  - Production environment stage only installs production dependencies (`pnpm install --prod`).

### Task 1.2: Docker Compose Unified Configuration
* **Description**: Update `docker-compose.yaml` to run PostgreSQL and the Backend API in a unified networks bridge, with Postgres healthcheck.
* **Criterios de Aceptación**:
  - `docker-compose.yaml` exposes `postgres` and `backend` services.
  - `backend` depends on `postgres` healthy condition.
  - Exposes port `3000` for backend API and `5433` for postgres database externally.

### Task 1.3: Database Seeding Script
* **Description**: Implement a database seed script to populate basic entities (Usuario with operario/jefe/admin roles, LineaProduccion, Etapa, RutaPasada, Articulo) to facilitate local/office manual testing.
* **Criterios de Aceptación**:
  - Script `src/seed.ts` is implemented and can be executed via `pnpm seed` or `npm run seed`.
  - Creates a default admin user, a jefe user, 3 default operarios, 3 lineas, 4 etapas, and 2 default routes.

---

## PR 2: 2FA Authentication Services & Endpoints

### Task 2.1: [x] Zod Schemas Validation Definition
* **Description**: Define the validation schemas for authentication endpoints using Zod (`LoginSchema`, `ActivarSesionSchema`, `CerrarSesionOperarioSchema`).
* **Criterios de Aceptación**:
  - [x] Zod schemas defined in `src/utils/schemas.ts`.
  - [x] Validates PIN must be between 4 and 6 digits.

### Task 2.2: [x] SesionService Implementation (Timeout & Rate Limit)
* **Description**: Modify `src/services/sesion.service.ts` to support active sessions in memory, 5-minute inactivity operator session expiration, and 3-attempt PIN rate-limiting blocking.
* **Criterios de Aceptación**:
  - [x] Timeout logic successfully invalidates `usuarioIdOperario = null` after 5 minutes of inactivity.
  - [x] Block line PIN validation for 5 minutes after 3 failed PIN attempts.

### Task 2.3: [x] Two-Layer API Endpoints Development
* **Description**: Develop endpoints `/api/auth/login`, `/api/auth/activar-sesion-operario`, `/api/auth/cerrar-sesion-operario` and `/api/auth/sesion-activa/:lineaId` in `auth.controller.ts` and `auth.routes.ts`.
* **Criterios de Aceptación**:
  - [x] Middleware `authenticateJWT` secures Layer 2 endpoints.
  - [x] Return HTTP 429 when a blocked line attempts to activate session.
  - [x] Return HTTP 200 with session state or null if in puesta a punto.

### Task 2.4: [x] Integration Tests Suite
* **Description**: Write comprehensive tests in `src/services/sesion.service.test.ts` and `src/api.test.ts` to validate timeout, rate-limiting, and endpoints success/error scenarios.
* **Criterios de Aceptación**:
  - [x] Run all tests using `pnpm test run` and verify they pass in green.
