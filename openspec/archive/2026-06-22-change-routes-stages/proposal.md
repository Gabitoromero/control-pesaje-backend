# Proposal: Routes and Stages Association

## Intent
The backend currently exposes routes and route-stage associations as completely independent resources, requiring multiple non-transactional HTTP requests to save a configured route. Additionally, there are existing schema bugs preventing the route-stage association from working. We need to implement a transactional, nested endpoint approach to allow atomically creating and updating routes with their stage configurations in a single payload.

## Scope

### In Scope
- Fix `RutaPasadaEtapaCreateSchema` to correctly reference `rutaPasada`.
- Add a bidirectional `@OneToMany` relationship in the `RutaPasada` model.
- Add nested `etapas` validation schemas for creating and updating routes.
- Override `create` and `update` in `RutaPasadaService` to transactionally reconcile nested stages.
- Override `findAll` and `findById` in `RutaPasadaService` to populate the associated stages.
- Add integration and validation tests for the new nested schemas and endpoints.

### Out of Scope
- Frontend UI modifications for the route settings form (to be handled in a separate change).
- Modifying the underlying database schema migrations (tables already exist and are correct).

## Capabilities
### New Capabilities
- `routes-stages-management`: Manage routes and their ordered stages transactionally via nested endpoints.

### Modified Capabilities
None

## Approach
Transactional Nested Endpoint (Atomic Composition): We will extend the `/api/rutas-pasadas` `POST` and `PUT` endpoints to accept a nested list of stages (`etapas`). The `RutaPasadaService` will be overridden to process the route and all its stage configurations in a single database transaction unit, ensuring atomic saves and easy frontend integration.

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/shared/schemas.ts` | Modified | Fix validation bugs and define nested schema structures. |
| `backend/src/models/RutaPasada.ts` | Modified | Add `@OneToMany` relationship to `RutaPasadaEtapa`. |
| `backend/src/services/ruta-pasada.service.ts` | Modified | Override methods for transactional nested reconciliation and relation populating. |
| `backend/src/shared/schemas.test.ts` | Modified | Add validation tests for the new Zod schemas. |
| `backend/src/api.test.ts` | Modified | Add integration tests for atomic creation/updates of routes and stages. |

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Stage Reordering Constraints | Medium | Handle stage updates carefully in a single flush transaction to avoid temporary uniqueness violations. |
| Cascading Soft-Deletions | Low | Ensure that soft-deleting a route appropriately cascades to its associated stages. |
| Decimal Precision Validation | Low | Ensure Zod weights match database precision `decimal(8,3)` to avoid rounding issues. |

## Rollback Plan
Revert the PR or commit containing these changes. Since no new database tables or columns are introduced, rolling back the application code will safely restore the original independent REST endpoints without causing data corruption.

## Dependencies
- None.

## Success Criteria
- [ ] Zod schemas correctly validate nested route and stages payloads.
- [ ] Creating or updating a route with stages succeeds atomically in a single HTTP request.
- [ ] Integration tests pass for both successful nested operations and invalid payload rejections.
