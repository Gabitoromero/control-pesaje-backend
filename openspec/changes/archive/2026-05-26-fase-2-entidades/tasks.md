# Tasks: Core Domain Entities & MikroORM Setup

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 350-450 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

## Phase 1: Base Entities

- [x] 1.1 Create `src/models/Usuario.ts` representing user accounts, including roles and a `datos_adicionales` JSONB field with `UsuarioMetadata` interface typing.
- [x] 1.2 Create `src/models/LineaProduccion.ts` mapping production lines with a unique scale number (`numero_balanza`).
- [x] 1.3 Create `src/models/Articulo.ts` mapping core products.
- [x] 1.4 Create `src/models/Marca.ts` mapping product brands with unique brand names.
- [x] 1.5 Create `src/models/Etapa.ts` mapping active stages in the production process.

## Phase 2: Relational & Dependent Entities

- [x] 2.1 Create `src/models/ArticuloMarca.ts` with explicit N:M mapping between `Articulo` and `Marca`, enforcing compound uniqueness and using an autoincrement primary key `id`.
- [x] 2.2 Create `src/models/RutaPasadaEtapa.ts` mapping weighing limits and ordering, enforcing `decimal(8,3)` constraints for weight metrics and cascading delete rules on relationships.
- [x] 2.3 Create `src/models/index.ts` to export all 7 domain entities to simplify model imports across the codebase.

## Phase 3: Verification & Integration Testing

- [x] 3.1 Create `tests/models.test.ts` configuring an in-memory or temporary test DB with `SchemaGenerator` to verify MikroORM v7 metadata discovery for all 7 entities.
- [x] 3.2 Add CRUD tests inside `tests/models.test.ts` to assert that `Usuario` correctly saves and retrieves nested JSONB structures.
- [x] 3.3 Add database constraint tests inside `tests/models.test.ts` to assert decimal rounding for `RutaPasadaEtapa` limits (precision 8, scale 3) and cascade/uniqueness violations.
