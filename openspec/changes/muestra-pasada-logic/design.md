# Design: Muestra & Pasada Logic

## Technical Approach

Introduce `Pasada` and `Muestra` entities in the MikroORM core persistence layer. Build the `SesionService` memory singleton to bind operator, tablet, and production line, enforcing active line session state to discard weight packets from inactive lines. Weight data is validated against stage limits defined in `RutaPasadaEtapa`, with `ok` samples counting towards completion of the stage, while `fuera_de_rango` weights are saved for traceability but ignored for completion. Unique numbers for `Pasada` will be generated inside a pessimistic write lock transaction to avoid duplicate sequence numbers on high concurrency.

## Architecture Decisions

| Decision | Option A (Selected) | Option B | Rationale |
| :--- | :--- | :--- | :--- |
| **Soft-Delete Uniformity** | Retain `activo: boolean = true` in both tables to comply with `BaseService`. | Bypass `BaseService` or remove `activo` column. | Compliance with `BaseService<T>` generics simplifies CRUD services and maintains codebase uniformity. |
| **Session Registry** | Store active line sessions in an in-memory singleton (`SesionService`). | Persist sessions in a database table. | Extreme low latency, aligns with upcoming WebSocket connections, avoids DB I/O overhead for ephemeral state. |
| **Numbering Concurrency** | Use a pessimistic write lock (`SELECT ... FOR UPDATE`) in database transaction. | Use database unique composite constraint. | Handles custom reset per article-line and guarantees sequential values without generating DB conflict errors. |

## Data Flow

```text
Raspberry (Weight) ──→ MuestraController ──→ SesionService (Validation)
                                                   │
     ┌────────────────── Discard ◄─────────────────┴───────── Active? (No)
     ▼
  Ignore Weight
     │
     └──────── (Yes) ──→ PasadaService (Check Range) ──→ Save Muestra (ok/fuera_de_rango)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/models/Pasada.ts` | Create | MikroORM legacy entity mapping for `Pasada`. |
| `src/models/Muestra.ts` | Create | MikroORM legacy entity mapping for `Muestra`. |
| `src/models/index.ts` | Modify | Export new entities. |
| `src/services/sesion.service.ts` | Create | Singleton manager for operator line sessions in memory. |
| `src/services/pasada.service.ts` | Create | Handles run initiation, locks, and completions. |
| `src/services/muestra.service.ts` | Create | Weight limits validation and record keeping. |
| `src/controllers/pasada.controller.ts` | Create | Handles `/api/pasadas` routes. |
| `src/controllers/muestra.controller.ts` | Create | Handles `/api/muestras` routes. |
| `src/routes/pasadas.routes.ts` | Create | Router setup for `/api/pasadas`. |
| `src/routes/muestras.routes.ts` | Create | Router setup for `/api/muestras`. |
| `src/routes/index.ts` | Modify | Mount pasadas and muestras routes. |
| `src/utils/schemas.ts` | Modify | Zod validation schemas for request bodies. |

## Interfaces / Contracts

```typescript
// In-memory Session Definition
export interface ActiveSession {
  lineaProduccionId: number;
  usuarioId: number;
  articuloId: number;
  pasadaId: number | null;
  connectedAt: Date;
}
```

```typescript
// Zod payload schemas
export const PasadaCreateSchema = z.object({
  lineaProduccionId: z.number().int().positive(),
  articuloId: z.number().int().positive(),
  marcaId: z.number().int().positive().optional(),
  usuarioId: z.number().int().positive()
});

export const MuestraCreateSchema = z.object({
  pasadaId: z.number().int().positive().optional(),
  usuarioId: z.number().int().positive(),
  articuloId: z.number().int().positive(),
  etapaId: z.number().int().positive(),
  lineaProduccionId: z.number().int().positive(),
  pesoNeto: z.number().positive(),
  observacion: z.string().optional()
});
```

### Entity Maps (Brief outline)

`Pasada` contains: `id` (PK), `lineaProduccion` (FK), `articulo` (FK), `marca` (FK, nullable), `usuario` (FK), `numero` (int), `estado` (`en_curso` \| `completa`), `horaInicio` (datetime), `horaCierre` (datetime, nullable), `activo` (boolean).

`Muestra` contains: `id` (PK), `pasada` (FK, nullable), `usuario` (FK), `articulo` (FK), `etapa` (FK), `lineaProduccion` (FK), `pesoNeto` (decimal), `estadoValidacion` (`ok` \| `fuera_de_rango`), `observacion` (text, nullable), `timestamp` (datetime), `activo` (boolean).

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `SesionService` | Verify memory maps register, validate active, and clear sessions. |
| Unit | `Muestra` range calculations | Verify samples are correctly tagged `ok` or `fuera_de_rango` against limits. |
| Integration | Concurrency locks on numbering | Mock 10 requests starting runs simultaneously on the same line to verify sequential unique numbers. |
| Integration | API Endpoints | Test `/api/pasadas` and `/api/muestras` POST payloads and response codes under Express/Vitest. |

## Migration / Rollout

A PostgreSQL migration file will be generated via MikroORM Migrator CLI containing:
- Creation of `pasada` enum (`en_curso`, `completa`) and `muestra` validation enum (`ok`, `fuera_de_rango`).
- Creation of `pasada` and `muestra` tables with foreign keys pointing to `linea_produccion`, `articulo`, `marca`, `usuario`, and `etapa`.
- Rollback can be performed using `npx mikro-orm migration:down`. No data migration required as these are new transactional tables.

## Open Questions

- [ ] Should a finished Pasada reject new Muestra association? (Recommended: Yes, samples should only be added if Pasada is `en_curso`).
