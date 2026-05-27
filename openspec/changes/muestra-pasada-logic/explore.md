## Exploration: Definición y planificación de las entidades Muestra y Pasada y su interacción con las lógicas del negocio

### Current State
Currently, the codebase implements the static setup models (`Usuario`, `LineaProduccion`, `Articulo`, `Marca`, `ArticuloMarca`, `Etapa`, `RutaPasadaEtapa`) under `src/models/` and their basic routes, controllers, and services.
However, the two core transactional entities — `Pasada` (execution of weight paths) and `Muestra` (individual weight records) — do not exist yet. There is also no session management (tablet-operator-line binding) or real-time context orchestrator to discard incoming Raspberry Pi weights when no operator session is active on that line.

### Affected Areas
- `src/models/Pasada.ts` (NEW) — Defines the `Pasada` entity, its fields (`numero`, `estado`, `horaInicio`, `horaCierre`), and foreign relationships using MikroORM legacy decorators.
- `src/models/Muestra.ts` (NEW) — Defines the `Muestra` entity, including properties for validation state, decimals for weight, and a nullable relationship to `Pasada` (enabling independent controls "al azar").
- `src/models/index.ts` — Updated to export the new entities.
- `src/utils/schemas.ts` — Updated to add Zod schemas for validating payloads when starting pasadas or registering samples.
- `src/services/pasada.service.ts` (NEW) — To implement business logic for pasadas, including autoincremental pasada numbers and checking stage sequence completion.
- `src/services/muestra.service.ts` (NEW) — To handle weight validation against `RutaPasadaEtapa` ranges and check active line session context.
- `src/services/sesion.service.ts` (NEW) — To manage operator-tablet-line session states.
- `src/routes/` and `src/controllers/` — New route/controller pairs for both entities, mounted on `src/routes/index.ts`.

### Approaches

#### 1. Transactional Entities and the `BaseService` Constraint
The base class `BaseService` in `src/services/base.service.ts` expects entities to extend `{ id: number; activo: boolean }` to support soft-deleting. However, `Pasada` and `Muestra` represent transactional logs that should be immutable and not deleted.

- **Option A: Conform to BaseService by adding `activo`**
  - *Description*: Define `activo: boolean = true` in both entities.
  - *Pros*: High code consistency. Seamlessly inherits all base generic service methods (`findAll`, `findById`, `update`) without extra refactoring.
  - *Cons*: Unnecessary column in transactional tables; logical deleting is semantically incorrect for weights and runs.
  - *Effort*: Low

- **Option B: Restructure Service Layers for transactional logs**
  - *Description*: Refactor `BaseService` generic constraints to make `activo?: boolean` optional, or bypass `BaseService` entirely for `Pasada` and `Muestra` and write standalone services.
  - *Pros*: High database semantic purity. Transactional tables remain clean and free from unnecessary flags.
  - *Cons*: Slight disruption to the current uniform CRUD patterns; more manual code to write.
  - *Effort*: Medium

#### 2. Active Session Store (Orquestador de Contexto)
Incoming weight measurements from Raspberry Pi must be discarded if the target line does not have an active operario session.

- **Option A: In-memory Session Registry (Singleton)**
  - *Description*: Keep active sessions in an in-memory dictionary `Map<number, ActiveSession>` in the Node process, matching WebSockets/Tablet connections.
  - *Pros*: Extremely low latency, perfectly suited for real-time WebSocket connection lifecycles, and avoids database read/write roundtrips for volatile states.
  - *Cons*: Sessions are lost if the server restarts (though tablets will instantly reconnect and restore their context).
  - *Effort*: Low

- **Option B: Database-persistent Session Table**
  - *Description*: Save active sessions in a dedicated `sesion_activa` PostgreSQL table.
  - *Pros*: Persistent across server restarts; easy historical session auditing.
  - *Cons*: Higher I/O overhead (adds DB query/write latency to every weight packet received).
  - *Effort*: Medium

### Recommendation
1. **Approach 1 (Option A)**: To preserve codebase homogeneity and quick setup, include the `activo: boolean = true` property on `Pasada` and `Muestra`, but add validation guards in controllers/services to reject actual deletion/update requests on finished records.
2. **Approach 2 (Option A)**: Adopt the **In-memory Session Registry**. It integrates seamlessly with the upcoming Phase III real-time WebSockets setup, is incredibly fast, and avoids unneeded DB write overhead.

### Risks
- **Concurrency in Pasada numbering (RN-10)**: If multiple requests start a pasada for the same line/article concurrently, they could calculate the same `numero`. This must be guarded using database-level transaction locks (`SELECT ... FOR UPDATE`) or a strict uniqueness constraint on `[linea_produccion_id, articulo_id, numero]`.
- **Stale tablet sessions**: If a tablet loses connection abruptly without explicit logout, the session might remain open. The session service must handle WebSocket disconnect hooks to clean up active sessions automatically after a short grace period.

### Ready for Proposal
Yes — The architecture and requirements are completely clear. We are ready to propose the precise entity definitions, schemas, and services to implement `Muestra`, `Pasada`, and the line session orchestration context.
