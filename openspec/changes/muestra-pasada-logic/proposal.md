# Proposal: Muestra and Pasada Domain & Orchestration Logic

## Intent
Implement the transactional core logic of weight controls by introducing `Pasada` and `Muestra` entities, checking active operator sessions per line in memory, validating samples, and preventing duplicate pasada numbers.

## Scope

### In Scope
- Define `Pasada` and `Muestra` MikroORM entities conforming to `BaseService` structure with safe logical soft-deletes restricted in handlers.
- Support `abortada` state in `Pasada` requiring a `motivo_cierre` for closure reasoning when aborted by authorized users.
- Auto-increment `Pasada.numero` uniquely per `(linea_produccion_id, articulo_id)` utilizing transaction locks to avoid concurrency duplicates.
- Implement an in-memory `SesionService` singleton that holds active operator sessions mapping lines to WebSocket clients.
- Create Zod validation schemas for payload and weight-status logic (validating weights against `RutaPasadaEtapa` ranges, tagging as `ok` or `fuera_de_rango`).
- Ensure only `ok` samples count toward stage completion in `RutaPasadaEtapa.cantidad_muestras_requeridas`.
- Add GET/POST/PUT endpoints for both entities.

### Out of Scope
- Real-time WebSocket connection handling (deferred to Phase III).
- Persistent database storage for active session states.
- Offline synchronization logic for lost connectivity.

## Capabilities

> This section is the CONTRACT between proposal and specs phases.
> The sdd-spec agent reads this to know exactly which spec files to create or update.
> Research `openspec/specs/` before filling this in.

### New Capabilities
- `muestra-pasada-domain`: Covers `Pasada` and `Muestra` persistence, validation constraints, and business logic for weight checks and stages.
- `session-orchestration`: Covers the in-memory operator-tablet-line session registry and real-time context validation.

### Modified Capabilities
- None

## Approach
1. **Entities & Homogeneity**: Implement `Pasada` and `Muestra` containing an `activo: boolean = true` column to satisfy generic `BaseService` constraints. Use validation middleware/guards to reject updates or soft-deletes of completed records.
2. **Context Orchestrator**: Keep active line sessions in an in-memory `Map<number, ActiveSession>` registry. Weight packets received on lines without active sessions are automatically discarded.
3. **Stage Validation**: Only `ok` samples contribute towards the required target. In-range calculation uses `RutaPasadaEtapa` min/max.
4. **Concurrency Guard**: Wrap pasada number checks inside database transactions using `SELECT ... FOR UPDATE` (pessimistic lock) or rely on a DB unique index on `(linea_produccion_id, articulo_id, numero)` to avoid race duplicates.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/models/Pasada.ts` | New | `Pasada` MikroORM entity definition. |
| `src/models/Muestra.ts` | New | `Muestra` MikroORM entity definition. |
| `src/models/index.ts` | Modified | Export new entities. |
| `src/utils/schemas.ts` | Modified | Add payload schemas for Pasada/Muestra. |
| `src/services/sesion.service.ts` | New | Singleton memory session manager. |
| `src/services/pasada.service.ts` | New | Numbering, transition, and transactional checks. |
| `src/services/muestra.service.ts` | New | In-memory filtering, range validation, and creation. |
| `src/controllers/` & `src/routes/` | New | Endpoints under `/api/pasadas` and `/api/muestras`. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Duplicate Pasada numbers | Medium | Wrap numbering query in transactions with pessimistic locks. |
| Memory leaks on stale sessions | Low | Add automatic cleanup callback hooks on client disconnects. |

## Rollback Plan
- Execute database migration downgrade script to drop `pasada` and `muestra` tables.
- Revert git repository to state before this change branch.

## Dependencies
- None.

## Success Criteria
- [ ] Database successfully persists `Pasada` and `Muestra` rows.
- [ ] Multiple concurrent requests starting runs on the same line cannot generate duplicate pasada numbers.
- [ ] Weighing measurements on lines without active sessions are discarded (returning 400 or ignoring).
- [ ] Samples marked `fuera_de_rango` do not increment progress toward required stage weight counts.
