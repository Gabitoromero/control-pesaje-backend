# api-core Specification

## Purpose
Expose RESTful CRUD endpoints for the main domain entities utilizing standard JSON structures, Zod input validation, and logical deletion.

## Requirements

### Requirement: CRUD Endpoints
The system MUST expose the following kebab-cased Spanish REST endpoints:
- `/api/usuarios`
- `/api/articulos`
- `/api/etapas`
- `/api/lineas-produccion`
- `/api/rutas-pasadas-etapas`

Each endpoint MUST support standard HTTP verbs: `GET` (list/retrieve), `POST` (create), `PUT` (update), and `DELETE` (soft-delete).

### Requirement: Payload Validation
All incoming `POST` and `PUT` request payloads MUST undergo Zod schema validation before hitting business logic.
- `Articulo` MUST support an optional, extensible `metadata` field stored as a PostgreSQL `jsonb` type.
- Invalid payloads MUST be rejected with HTTP 400 Bad Request.

### Requirement: Standard API Response
All responses MUST follow a standardized JSON layout.

| Result | HTTP Status | Payload Format |
|--------|-------------|----------------|
| Success | 200 OK / 201 Created | `{ "success": true, "data": Object/Array }` |
| Error | 4xx / 5xx | `{ "success": false, "error": { "message": string, "details"?: any } }` |

### Requirement: Soft Deletion & Query Filters
To preserve database trace integrity, physical deletion is prohibited.
- `DELETE` requests MUST perform soft-deletions by setting the entity `activo` attribute to `false`.
- The database layer MUST implement a global `@Filter` to automatically exclude inactive records (`activo = false`) from all query results by default.

---

## Scenarios

### Scenario: Successful Articulo Creation (Happy Path)
- GIVEN a valid JSON payload for a new Articulo containing the optional `metadata` jsonb field
- WHEN a POST request is sent to `/api/articulos`
- THEN the system MUST return 201 Created with `{ "success": true, "data": { "id": "...", "nombre": "...", "activo": true, "metadata": { ... } } }`

### Scenario: Articulo Validation Failure (Invalid Schema)
- GIVEN a POST request payload for Articulo missing the required `nombre` field
- WHEN the request is received at `/api/articulos`
- THEN the system MUST reject it and return 400 Bad Request with `{ "success": false, "error": { "message": "Validation failed", "details": [...] } }`

### Scenario: Retrieve Active LineasProduccion Only (Edge Case / Soft Deletion)
- GIVEN a LineaProduccion is soft-deleted by setting `activo: false`
- WHEN a GET request is sent to `/api/lineas-produccion`
- THEN the system MUST NOT include the soft-deleted LineaProduccion in the returned array
## ADDED Requirements

### Requirement: Pasada and LineaProduccion Observacion Exposure

`GET`, `POST`, and `PUT` payloads for `/api/pasadas` and `/api/lineas-produccion` MUST include an `observacion` field: a nullable free-text note, distinct per entity, subject to Zod validation (non-empty string when provided, `null` allowed to clear).

#### Scenario: GET pasada list includes observacion
- GIVEN a persisted pasada with a non-null `observacion`
- WHEN a `GET` request is sent to `/api/pasadas`
- THEN each pasada object in the response array MUST include its `observacion` value

#### Scenario: GET pasada detail includes observacion
- GIVEN a persisted pasada with a non-null `observacion`
- WHEN a `GET` request is sent to `/api/pasadas/:id`
- THEN the response MUST include `observacion`

#### Scenario: GET lineas-produccion list and detail include observacion
- GIVEN a persisted `LineaProduccion` with a non-null `observacion`
- WHEN a `GET` request is sent to `/api/lineas-produccion` or `/api/lineas-produccion/:id`
- THEN the returned object(s) MUST include `observacion`, including via the `assignDevice` response shape

#### Scenario: PUT lineas-produccion updates observacion
- GIVEN an existing `LineaProduccion`
- WHEN a `PUT` request to `/api/lineas-produccion/:id` includes a new `observacion` value
- THEN the system MUST accept the request and the subsequent `GET` MUST reflect the updated value

#### Scenario: PUT pasada with invalid observacion is rejected
- GIVEN an existing pasada in any state
- WHEN a `PUT` request to `/api/pasadas/:id` sends `observacion: ""`
- THEN the system MUST reject the request with HTTP 400 Bad Request, per Zod validation
