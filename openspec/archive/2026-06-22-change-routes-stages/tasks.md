# Tasks: Routes and Stages Association

## Review Workload Forecast
| Field | Value |
|-------|-------|
| Estimated changed lines | ~150 lines |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Phase 1: Foundation (Schemas and Models)
- [x] 1.1 `backend/src/shared/schemas.ts`: Modify `RutaPasadaEtapaCreateSchema` to make `rutaPasada` optional for nested payloads.
- [x] 1.2 `backend/src/shared/schemas.ts`: Add `etapas` to `RutaPasadaCreateSchema` and `RutaPasadaUpdateSchema` as an array of nested schemas.
- [x] 1.3 `backend/src/models/RutaPasada.ts`: Add `etapas` relation (hasMany to `RutaPasadaEtapa`) and declare `etapas?: RutaPasadaEtapa[];`.

## Phase 2: Core Logic (Services)
- [x] 2.1 `backend/src/services/ruta-pasada.service.ts`: Override `create` to include transactional logic for creating nested `RutaPasadaEtapa` records.
- [x] 2.2 `backend/src/services/ruta-pasada.service.ts`: Override `update` to handle reconciling/syncing of `RutaPasadaEtapa` records within a managed transaction.
- [x] 2.3 `backend/src/services/ruta-pasada.service.ts`: Override `delete` to cascade `activo: false` to associated `RutaPasadaEtapa` records.
- [x] 2.4 `backend/src/services/etapa.service.ts`: Add a deletion guard in the `delete` method to prevent deleting an `Etapa` associated with any active `RutaPasadaEtapa`.

## Phase 3: Testing
- [x] 3.1 Write integration tests to verify transactional creation and update logic for nested `RutaPasadaEtapa` via `/api/rutas-pasadas`.
- [x] 3.2 Write integration tests to verify soft-delete cascade from `RutaPasada` to `RutaPasadaEtapa`, ensuring master `Etapa` records are unaffected.
- [x] 3.3 Write integration tests to assert a 400 error when attempting to delete an `Etapa` assigned to an active route.
