## Exploration: Routes and Stages Association in Backend

### Current State
Currently, the backend defines routes (`RutaPasada`) and their stage configurations (`RutaPasadaEtapa`) as separate entities.
The endpoints `/api/rutas-pasadas` and `/api/rutas-pasadas-etapas` are exposed individually using the generic controller factory `createCrudHandlers(service)`.
However:
1. **Broken Schema**: `RutaPasadaEtapaCreateSchema` inside `backend/src/shared/schemas.ts` defines the foreign key field as `articulo` instead of `rutaPasada`. This is a legacy leftover from when `RutaPasadaEtapa` was linked to `Articulo` directly. As a result, any attempt to call `POST /api/rutas-pasadas-etapas` will fail validation (if `rutaPasada` is sent) or throw a database constraint error (if `articulo` is sent).
2. **Missing Relationship**: The `RutaPasada` model does not declare its bidirectional `@OneToMany` relationship with `RutaPasadaEtapa`, making it impossible for MikroORM to easily auto-populate associated stages when retrieving routes.
3. **No Transactional Boundary**: The frontend must issue multiple HTTP requests to create or update a route and its stages. This is prone to race conditions, partial save failures, and lacks database transaction boundary protection.

### Affected Areas
- `backend/src/shared/schemas.ts` — Need to fix `RutaPasadaEtapaCreateSchema` to replace `articulo` with `rutaPasada`. For nested writes, we must define `RutaPasadaEtapaNestedCreateSchema` and add `etapas` schema arrays under `RutaPasadaCreateSchema` and `RutaPasadaUpdateSchema`.
- `backend/src/models/RutaPasada.ts` — Need to add the `@OneToMany(() => RutaPasadaEtapa, rpe => rpe.rutaPasada, { orphanRemoval: true }) etapas = new Collection<RutaPasadaEtapa>(this);` relationship to allow loading stages automatically when fetching routes.
- `backend/src/services/ruta-pasada.service.ts` — Need to override `findAll` and `findById` to populate the `etapas.etapa` relationship, and override `create` and `update` to handle transactional saving and reconciliation of nested stages.
- `backend/src/shared/schemas.test.ts` — Add validation tests for the fixed/new Zod schemas to guarantee they parse and validate relationships and weight properties correctly.
- `backend/src/api.test.ts` — Add integration tests for creating, updating, and getting routes with their associated stages, verifying both successful updates and invalid payload rejections.

### Approaches

1. **Independent REST Endpoints (Minimalist REST)** — Maintain routes and route-stage associations as completely independent HTTP resources. Fix the Zod schema bug so `/api/rutas-pasadas-etapas` can be used.
   - Pros:
     - Simple backend implementation; no custom transactional reconciliation logic needed.
     - Aligns with standard REST guidelines for flat resources.
   - Cons:
     - Terrible user/developer experience: creating a route with 3 stages requires 4 separate API requests.
     - No transactional safety across requests: if the 3rd stage fails to save, the database is left in a corrupted state.
     - Complex frontend logic for managing the state of multiple unsaved/edited stages.
   - Effort: Low

2. **Transactional Nested Endpoint (Atomic Composition)** — Extend the `/api/rutas-pasadas` `POST` and `PUT` endpoints to accept a nested list of stages (`etapas`), processing the route and all its stage configurations in a single transactional unit. Override service methods to perform stage reconciliation (creating, updating, and soft-deleting associations as needed).
   - Pros:
     - Atomic saves: either everything is saved successfully, or the transaction rolls back completely.
     - Excellent developer experience: the frontend submits a single JSON payload representing the entire route form.
     - Returns the route populated with its stages automatically, reducing API calls.
   - Cons:
     - Requires writing reconciliation logic in `RutaPasadaService` to handle creation, updates, and soft deletes of the nested stages array.
   - Effort: Medium

### Recommendation
We recommend **Approach 2 (Transactional Nested Endpoint)**. It provides a robust, production-ready solution that matches standard API patterns for form-based settings (RF-23). The transactional safety ensures that routes are never left in a partially configured state, and it significantly simplifies the frontend integration. By overriding the service layer methods (`findAll`, `findById`, `create`, `update`), we keep the routing and controller layers clean and DRY.

### Risks
- **Stage Reordering and Key Constraints**: Updating stages can modify their `orden` or stage IDs. Since the pivot table has a compound unique constraint on `(ruta_pasada_id, etapa_id)`, updating a route's stages must be handled carefully in a single flush transaction to avoid temporary uniqueness violations.
- **Cascading Soft-Deletions**: When a route is soft-deleted, its associated stages (`RutaPasadaEtapa` items) must also be marked inactive to maintain database integrity and avoid ghost associations.
- **Validation of Decimal Precision**: Zod validations for weights (ideal, min, max) must match database precision (`decimal(8,3)`) to ensure client inputs are not rejected or rounded unexpectedly at the database level.

### Ready for Proposal
Yes
