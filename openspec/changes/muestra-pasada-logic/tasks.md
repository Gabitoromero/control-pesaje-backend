# Tasks: Muestra & Pasada Domain & Session Orchestration

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 600-800 lines |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Models & Migrations) → PR 2 (Services & Unit Tests) → PR 3 (Controllers, Routes & Integration Tests) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units
- **PR 1: Models & Migrations**: MikroORM models `Pasada` and `Muestra` in `src/models/`, register in `index.ts`, and generate schema migration.
- **PR 2: Core Services & Unit Tests**: Implement `SesionService` (in-memory singleton), `PasadaService` (lock-guaranteed unique number sequence), and `MuestraService` (range & sequence checks), with Vitest unit tests.
- **PR 3: Controllers, Routes & Integrations**: Implement `PasadaController`, `MuestraController`, Zod validation schemas in `src/utils/schemas.ts`, mount routes, and write integration tests.

## Phase 1: Models & Migrations (PR 1)
- [x] 1.1 Create `src/models/Pasada.ts` conforming to soft-delete (`activo`), with standard relationships (Line, Article, User, Marca).
- [x] 1.2 Create `src/models/Muestra.ts` conforming to soft-delete (`activo`), linking to Pasada, User, Article, Etapa, Line.
- [x] 1.3 Export both models from `src/models/index.ts`.
- [x] 1.4 Generate migration via MikroORM CLI `npx mikro-orm migration:create` and verify.

## Phase 2: Core Services & Unit Tests (PR 2)
- [x] 2.1 Implement in-memory singleton `src/services/sesion.service.ts` for operator active sessions (`Map<number, ActiveSession>`) enforcing one session per user.
- [x] 2.2 Implement `src/services/pasada.service.ts` with a pessimistic transaction write-lock (`FOR UPDATE`) to assign unique incrementing numbers per line-article.
- [x] 2.3 Implement `src/services/muestra.service.ts` to validate limits via `RutaPasadaEtapa`, sequentially advancing stages, and ignoring `fuera_de_rango` weights for completion.
- [x] 2.4 Block updates and physical deletes for both models at handler layer.
- [x] 2.5 Write unit tests (`tests/services/sesion.service.test.ts` and `tests/services/muestra.service.test.ts`) validating memory limits and range categorization.

## Phase 3: Controllers, Routes & Integrations (PR 3)
- [ ] 3.1 Define Zod schemas in `src/utils/schemas.ts` using `z.object` and Zod 4 conventions.
- [ ] 3.2 Implement `src/controllers/pasada.controller.ts` and `src/controllers/muestra.controller.ts` with error handling.
- [ ] 3.3 Create routers `src/routes/pasadas.routes.ts` and `src/routes/muestras.routes.ts`, and register them in `src/routes/index.ts`.
- [ ] 3.4 Discard weights from Raspberry scale if line session is inactive.
- [ ] 3.5 Write integration tests for API endpoints `/api/pasadas` and `/api/muestras` verifying sequential progress and concurrency locks.
