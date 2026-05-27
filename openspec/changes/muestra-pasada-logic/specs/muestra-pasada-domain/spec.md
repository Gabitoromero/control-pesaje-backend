# muestra-pasada-domain Specification

## Purpose
Manage the core domain models and validation rules for weight verification runs (Pasadas) and weight measurements (Muestras) sequentially across stages.

## Requirements

### Requirement: Pasada Initialization
- A `Pasada` MUST be initialized with `linea_produccion_id` and `articulo_id` (and optional `marca_id`).
- It MUST start in state `en_curso`.
- A `Pasada` MAY be aborted by an authorized user.
- Aborting a `Pasada` MUST change its state to `abortada`, set `horaCierre` to the current timestamp, and require a non-empty `motivo_cierre` justifying the action.
- Once a `Pasada` is `abortada`, it MUST reject any new sample registrations, updates, or deletions.
- It MUST automatically assign an incremental `numero` unique per `(linea_produccion_id, articulo_id)` starting from 1.
- Database transactions MUST prevent duplicate `numero` values under concurrent requests using pessimistic locking or unique constraints.

### Requirement: Muestra Registration & Range Validation
- A `Muestra` MUST register `usuario_id`, `articulo_id`, `etapa_id`, `linea_produccion_id`, `peso_neto`, and a `timestamp`.
- It MAY belong to a `Pasada` (standard weight control) or be standalone (random quality check).
- The system MUST validate `peso_neto` against `pesoMinimo` and `pesoMaximo` of the active `RutaPasadaEtapa` for the matching `articulo` and `etapa`.

| Condition | Assigned State |
|-----------|----------------|
| `pesoMinimo <= peso_neto <= pesoMaximo` | `ok` |
| `peso_neto < pesoMinimo` OR `peso_neto > pesoMaximo` | `fuera_de_rango` |

### Requirement: Sequential Stage Progression
- Stages of a `RutaPasadaEtapa` MUST be processed sequentially in ascending order of `orden`.
- Muestras for a stage MUST NOT be registered unless all preceding stages (lower `orden`) are complete.
- A stage is complete when active `Muestras` with `estado = 'ok'` linked to the `Pasada` and `etapa` equal or exceed the `cantidadMuestrasRequeridas`.
- Out-of-range (`fuera_de_rango`) samples MUST be persisted for traceability but MUST NOT count towards stage completion.
- Once all stages of a `Ruta` are complete, the `Pasada.estado` MUST transition to `completa`.

## Scenarios

### Scenario: Successful Pasada Initiation
- GIVEN a valid `linea_produccion_id` and `articulo_id`
- WHEN a POST request is sent to `/api/pasadas` to start a run
- THEN the system MUST return 201 Created and assign `numero = 1` and `estado = 'en_curso'`

### Scenario: Aborting an Active Pasada
- GIVEN an active `Pasada` in state `en_curso`
- WHEN the user aborts the pasada with a valid `motivo_cierre`
- THEN the system MUST return the updated pasada in state `abortada`, record `motivo_cierre`, set `horaCierre`, and reject subsequent sample submissions.

### Scenario: Concurrent Duplicate Prevention
- GIVEN two requests attempt to start a `Pasada` simultaneously on the same line and article
- WHEN the requests are executed concurrently under transaction isolation
- THEN the system MUST assign sequential numbers (e.g., 1 and 2) without duplicate errors

### Scenario: OK Sample Contributes to Stage Progress
- GIVEN an active `Pasada` at `Etapa A` requiring 3 samples, with 0 registered
- WHEN a `Muestra` is registered with `peso_neto` within limits
- THEN the system MUST set its state to `ok` and count it, making progress 1/3

### Scenario: Out of Range Sample Does Not Advance Stage
- GIVEN an active `Pasada` at `Etapa A` requiring 3 samples, with progress 1/3
- WHEN a `Muestra` is registered with `peso_neto` exceeding `pesoMaximo`
- THEN the system MUST set state to `fuera_de_rango` and preserve progress at 1/3

### Scenario: Enforcing Sequential Stage Order
- GIVEN `Etapa 1` is incomplete
- WHEN a request tries to submit a `Muestra` for `Etapa 2`
- THEN the system MUST reject the request with HTTP 400 Bad Request

### Scenario: Complete Pasada on Last Sample
- GIVEN `Etapa 1` (last stage) is at progress 2/3
- WHEN the 3rd `ok` `Muestra` is registered for `Etapa 1`
- THEN the stage completes and the system MUST set `Pasada.estado = 'completa'`
