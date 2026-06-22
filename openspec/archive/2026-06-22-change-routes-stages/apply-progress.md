# Implementation Progress: change-routes-stages

## Mode: Strict TDD

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `backend/src/shared/schemas.test.ts` | Schemas | Yes | Fail on undefined property | Pass | `RutaPasadaEtapaCreateSchema` with and without `rutaPasada` | None |
| 1.2 | `backend/src/shared/schemas.test.ts` | Schemas | Yes | Fail on undefined `etapas` | Pass | Tested `RutaPasadaCreateSchema` and `RutaPasadaUpdateSchema` | Added `id` to allow tracking |
| 1.3 | `backend/src/models/RutaPasada.ts` | Models | Yes | N/A | Pass | MikroORM relations added correctly | Checked relation syntax |
| 2.1 | `backend/src/services/ruta-pasada.service.test.ts` | Services | Yes | Missing `create` transactional | Pass | Verified mock `transactional` flow | Mocked Entity Manager |
| 2.2 | `backend/src/services/ruta-pasada.service.test.ts` | Services | Yes | Missing `update` reconciliation | Pass | Verified nested creation, update and soft-delete | None |
| 2.3 | `backend/src/services/ruta-pasada.service.test.ts` | Services | Yes | Missing `delete` cascade | Pass | Verified cascade of `activo: false` to `RutaPasadaEtapa` | None |
| 2.4 | `backend/src/services/etapa.service.test.ts` | Services | Yes | Already has tests | Pass | Tested RestrictError on `Etapa` deletion | None |
| 3.1 | `backend/src/api.test.ts` | API | Yes | POST and PUT fail | Pass | Verified `/api/rutas-pasadas` routes | None |
| 3.2 | `backend/src/api.test.ts` | API | Yes | DELETE route fail | Pass | Verified cascading delete logic across layers | None |
| 3.3 | `backend/src/api.test.ts` | API | Yes | DELETE etapa fail | Pass | Verified 400 error via HTTP for active route constraint | None |

### Summary of Changes

- Updated schemas to support nested `etapas`.
- Added OneToMany relation `etapas` to `RutaPasada`.
- Implemented transactional `create` and `update` logic in `RutaPasadaService`.
- Added soft-delete cascading logic in `RutaPasadaService`.
- Wrote full unit test coverage for the new service methods.
- Wrote full integration test coverage for the API endpoints.
