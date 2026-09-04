# muestra-pasada-domain Specification (Delta)

> This delta SUPERSEDES the `Sequential Stage Progression` requirement introduced in
> `openspec/changes/muestra-pasada-logic/specs/muestra-pasada-domain/spec.md`. The
> `muestra-pasada-logic` change itself is left unedited (already applied and verified);
> this delta narrows the stage-completion rule for all consumers going forward.

## MODIFIED Requirements

### Requirement: Sequential Stage Progression
- Stages of a `RutaPasadaEtapa` MUST be processed sequentially in ascending order of `orden`.
- Muestras for a stage MUST NOT be registered unless all preceding stages (lower `orden`) are complete.
- A stage is complete when active `Muestras` linked to the `Pasada` and `etapa` with `estado IN ('ok', 'fuera_de_rango')` equal or exceed the `cantidadMuestrasRequeridas`. Both `ok` and `fuera_de_rango` samples count toward this quota; `descartado` samples MUST NOT count.
- Out-of-range (`fuera_de_rango`) samples MUST still be persisted for traceability, tagged distinctly from `ok`, and MUST still be visually distinguishable in the UI (unchanged colors/badges) even though they now count toward stage completion.
- There is no additional requirement for at least one `ok` sample; a stage whose entire quota is met by `fuera_de_rango` samples is complete.
- Once all stages of a `Ruta` are complete, the `Pasada.estado` MUST transition to `completa`.

## Scenarios

### Scenario: Out of Range Sample Now Contributes to Stage Progress
- GIVEN an active `Pasada` at `Etapa A` requiring 3 samples, with progress 1/3 (all `ok`)
- WHEN a `Muestra` is registered with `peso_neto` exceeding `pesoMaximo`
- THEN the system MUST set its state to `fuera_de_rango` AND count it, making progress 2/3

### Scenario: 100% Out-of-Range Samples Satisfy the Stage Quota
- GIVEN an active `Pasada` at `Etapa A` requiring 2 samples, with 0 registered
- WHEN two `Muestra`s are registered with `peso_neto` outside the configured range
- THEN both are persisted with state `fuera_de_rango`, progress reaches 2/2, and `Etapa A` is considered complete for sequential-order purposes

### Scenario: Discarded Samples Still Do Not Count
- GIVEN an active `Pasada` at `Etapa A` requiring 2 samples, with progress 1/2 (1 `ok`)
- WHEN a `Muestra` is registered and later marked `descartado`
- THEN progress remains at 1/2 and the preceding-stage check keeps rejecting registrations for the next stage
