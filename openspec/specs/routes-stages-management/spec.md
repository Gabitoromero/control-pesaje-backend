# routes-stages-management Specification

## Purpose
Manage routes (`RutaPasada`) and their ordered stages (`RutaPasadaEtapa`) transactionally as a single unit to ensure database consistency.

## Requirements

### Requirement: Transactional Creation
The system MUST allow creating a new route along with its stages in a single transactional request.

#### Scenario: Successful creation
- GIVEN a valid payload with route data and an array of stages
- WHEN the client submits a POST request to `/api/rutas-pasadas`
- THEN the system MUST save the route and its stages in a single database transaction
- AND return the fully populated route object

#### Scenario: Validation failure
- GIVEN a payload missing the `rutaPasada` association reference in stages or having incorrect precision for weights
- WHEN the client submits a POST request
- THEN the system MUST reject the request with a 400 validation error
- AND no data should be saved to the database

### Requirement: Transactional Update and Reconciliation
The system MUST allow updating an existing route and reconciling its nested stages (updating, creating, or soft-deleting) in a single transaction.

#### Scenario: Updating and reordering stages
- GIVEN an existing route with stages
- WHEN the client submits a PUT request with modified stages and a changed `orden`
- THEN the system MUST update the stages without violating unique constraints on `(ruta_pasada_id, etapa_id)`
- AND return the updated populated route

### Requirement: Cascading Soft-Deletes
The system MUST cascade soft-deletions from routes to their associated pivot stages (`RutaPasadaEtapa`). The master `Etapa` entity MUST NOT be modified or deleted.

#### Scenario: Deleting a route
- GIVEN an active route with active pivot stages
- WHEN the client requests to soft-delete the route
- THEN the system MUST set `activo: false` on the route
- AND set `activo: false` on all its associated `RutaPasadaEtapa` pivot records in the same transaction
- AND the master `Etapa` records MUST remain active and untouched

### Requirement: Etapa Deletion Guard
The system MUST prevent soft-deleting an `Etapa` if it is currently assigned to any active `RutaPasada`.

#### Scenario: Attempting to delete an in-use Etapa
- GIVEN an active `Etapa` that is associated with at least one active `RutaPasada`
- WHEN the client submits a request to soft-delete the `Etapa`
- THEN the system MUST reject the request with a validation error
- AND the `Etapa` MUST remain active
