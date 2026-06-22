# Design: Routes and Stages Association

## Technical Approach
Implement transactional creation and update logic for `RutaPasada` and its nested `RutaPasadaEtapa` pivot entities, utilizing Sequelize transactions. Adjust the Zod validation schemas in `schemas.ts` to allow nested pivot data upon creation/update, but exclude the `rutaPasada` ID since it's derived. Implement cascading soft-deletes overriding `destroy` and `restore` on the model or service level for `RutaPasada`, affecting only pivot records and protecting `Etapa`. Add a guard in `EtapaService` or override its `delete` method to prevent deletion of an `Etapa` associated with any active `RutaPasada`.

## Architecture Decisions
### Decision: Centralized Transaction Management in Service
**Choice**: Override the `create`, `update`, and `delete` methods in `ruta-pasada.service.ts` to handle `RutaPasadaEtapa` syncing within a managed transaction.
**Alternatives considered**: Using Sequelize hooks (`afterCreate`, `afterUpdate`).
**Rationale**: Service-level transactions provide better control, explicit error handling, and simpler nested payload validation compared to implicit model hooks.

### Decision: Soft-delete strategy
**Choice**: Override `delete` in `ruta-pasada.service.ts` to cascade `activo: false` to `RutaPasadaEtapa`. Master `Etapa` models are never touched.
**Alternatives considered**: Database-level cascading foreign keys.
**Rationale**: Soft-deletes (`activo` flags) are not standard database cascading actions. Implementing it in the service ensures application logic controls the cascade cleanly.

## Data Flow
1. Client sends POST/PUT to `/api/rutas-pasadas` with a nested `etapas` array.
2. The payload is validated by the router using Zod schemas (`RutaPasadaCreateSchema` with nested `RutaPasadaEtapa` schema).
3. The controller delegates to `RutaPasadaService`.
4. `RutaPasadaService` begins a transaction.
5. `RutaPasadaService` creates/updates `RutaPasada`.
6. `RutaPasadaService` reconciles `RutaPasadaEtapa` records (creating missing, updating existing, soft-deleting removed ones).
7. Transaction is committed.
8. If the client tries to delete an `Etapa`, `EtapaService` checks if `RutaPasadaEtapa` exists with an active `RutaPasada`. If so, it throws an error.

## File Changes
| File | Action | Description |
|------|--------|-------------|
| `backend/src/shared/schemas.ts` | Modify | Fix `RutaPasadaEtapaCreateSchema` (make `rutaPasada` optional for nested payloads) and add nested `etapas` to `RutaPasadaCreateSchema` and `RutaPasadaUpdateSchema`. |
| `backend/src/models/RutaPasada.ts` | Modify | Add `etapas` relation to `RutaPasadaEtapa` via `hasMany`. |
| `backend/src/services/ruta-pasada.service.ts` | Modify | Override `create`, `update`, and `delete` to include transactional logic for reconciling and cascading soft-deletes to `RutaPasadaEtapa`. |
| `backend/src/services/etapa.service.ts` | Modify | Add a deletion guard in the `delete` method to check for active `RutaPasada` usage. |

## Interfaces / Contracts
- `schemas.ts`: Add `etapas: z.array(RutaPasadaEtapaCreateSchema.omit({ rutaPasada: true }))` to `RutaPasadaCreateSchema`.
- `models/RutaPasada.ts`: Declare `declare etapas?: RutaPasadaEtapa[];` and set up the association.

## Testing Strategy
| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit/Integration | Transactional Create/Update | Use Supertest on `/api/rutas-pasadas` to verify nested creation and update logic rollbacks on errors. |
| Unit/Integration | Soft-Delete Cascade | Verify that deleting a route soft-deletes its pivot stages, but leaves master stages intact. |
| Unit/Integration | Etapa Deletion Guard | Attempt to delete an Etapa assigned to a route, assert 400 error. |

## Migration / Rollout
No migration required.

## Open Questions
None
