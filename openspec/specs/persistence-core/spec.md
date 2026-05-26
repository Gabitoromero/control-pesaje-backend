# Persistence Core Specification

## Purpose

Define the requirements for persistence, field validation, and data integrity of the 7 core domain entities and extensible fields in the weight control system.

## Requirements

### Requirement: REQ-PERS-01 - Core Entity Persistence and Default Values

The system MUST successfully persist the 7 core entities (`Usuario`, `LineaProduccion`, `Articulo`, `Marca`, `ArticuloMarca`, `Etapa`, `RutaPasadaEtapa`) ensuring non-nullable fields are present and `activo` fields default to `true`.

#### Scenario: Persist core entity with default active flag
- GIVEN a new `Articulo` with a valid name and no active flag specified
- WHEN the article is saved to the database
- THEN the system MUST persist the article with active set to true.

#### Scenario: Fail to persist entity when non-nullable fields are missing
- GIVEN a new `Usuario` with missing `nombre_usuario` or `password_hash`
- WHEN the user is saved to the database
- THEN the database transaction MUST roll back with a validation error.

### Requirement: REQ-PERS-02 - Uniqueness Constraints

The system MUST enforce strict unique constraints across the following database fields:
- `Usuario`: `nombre_usuario`
- `LineaProduccion`: `numero_balanza`
- `Marca`: `nombre`
- `ArticuloMarca`: combination of `(articulo_id, marca_id)`
- `RutaPasadaEtapa`: combination of `(articulo_id, etapa_id)`

#### Scenario: Enforce uniqueness for LineaProduccion balanza number
- GIVEN a persisted `LineaProduccion` with balanza number `1`
- WHEN a new `LineaProduccion` is saved with balanza number `1`
- THEN the persistence operation MUST fail with a unique constraint violation error.

#### Scenario: Enforce uniqueness for ArticuloMarca combination
- GIVEN an existing association between article `1` and brand `2`
- WHEN saving a new `ArticuloMarca` with article `1` and brand `2`
- THEN the database MUST reject the duplicate association.

### Requirement: REQ-PERS-03 - Decimal Bounds and Precision

The system MUST enforce that `RutaPasadaEtapa` decimal parameters (`peso_ideal`, `peso_minimo`, `peso_maximo`) are non-negative and persist exactly three decimal places (scale 3, precision 8).

#### Scenario: Scale and validate decimal weights
- GIVEN a new `RutaPasadaEtapa` with positive weights having 4 decimal places (e.g., `12.3456`)
- WHEN the record is saved to the database
- THEN the value MUST be rounded and stored as `12.346`.

### Requirement: REQ-PERS-04 - Flexible JSONB Extensibility

The `Usuario` and `Muestra` entities MUST feature a `datos_adicionales` field utilizing PostgreSQL `jsonb` type to store schema-flexible, nested configurations and sensor data.

#### Scenario: Persist and retrieve nested JSON telemetry
- GIVEN a `Muestra` with custom key-value pairs inside `datos_adicionales`
- WHEN the record is persisted and subsequently loaded from the database
- THEN the returned `datos_adicionales` MUST preserve the original nested structure and types.
