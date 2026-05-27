# Tasks: Core CRUD API & Role Authentication

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 500-700 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Chained by Entity/Layer |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

## Phase 1: Foundation

- [x] 1.1 Add dependencies `bcrypt`, `jsonwebtoken` and dev-dependencies `@types/bcrypt`, `@types/jsonwebtoken` to `package.json`.
- [x] 1.2 Add `@Filter({ name: 'activo', cond: { activo: true }, default: true })` on models `Usuario`, `Articulo`, `Etapa`, `LineaProduccion`, and `RutaPasadaEtapa`.
- [x] 1.3 Add `metadata?: Record<string, any>` JSONB column to `Articulo.ts`.
- [x] 1.4 Create `src/middlewares/validation.middleware.ts` for Zod schema payload parsing.
- [x] 1.5 Define request DTO validation schemas in `src/utils/schemas.ts` for all 5 entities.

## Phase 2: Core Implementation

- [ ] 2.1 Create `src/middlewares/auth.middleware.ts` implementing `authenticateJWT` and `requireRoles`.
- [ ] 2.2 Create `src/services/auth.service.ts` for credential checks, hashing with bcrypt, and JWT generation.
- [ ] 2.3 Create base abstract class `src/services/base.service.ts` to implement generic CRUD and soft delete.
- [ ] 2.4 Create entity-specific services in `src/services/` to enforce soft-delete reference restrict validation.

## Phase 3: Integration / Routing

- [ ] 3.1 Create controllers in `src/controllers/` mapping HTTP verbs to their corresponding services.
- [ ] 3.2 Create kebab-cased Express routers in `src/routes/` integrating Zod validation and JWT auth guards.
- [ ] 3.3 Create a central API index router in `src/routes/index.ts` to expose and register all routes.
- [ ] 3.4 Modify `src/app.ts` to register the index router, global error-handling middleware, and CORS configuration.

## Phase 4: Testing

- [ ] 4.1 Write integration tests in `src/app.test.ts` to verify the global soft-delete filter behaviour.
- [ ] 4.2 Write endpoint validation tests verifying Zod payload rejections return HTTP 400.
- [ ] 4.3 Write login endpoint tests verifying successful authentication and JWT return.
- [ ] 4.4 Write RBAC authorization tests validating role restrictions (e.g. `operario` blocked with HTTP 403 on write endpoints).
- [ ] 4.5 Write logical restrict tests ensuring parent deletion fails (returns HTTP 400) if active references exist.
