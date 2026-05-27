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
