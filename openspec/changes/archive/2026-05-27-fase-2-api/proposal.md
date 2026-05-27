# Proposal: Core CRUD API & Role Authentication (`fase-2-api`)

## Intent

Implement core CRUD APIs for domain entities with robust request validation, logical deletion, and secure JWT-based role authorization, ensuring high system trace integrity and extensible schemas.

## Scope

### In Scope
- CRUD endpoints for `Usuario`, `Articulo`, `Etapa`, `LineaProduccion`, and `RutaPasadaEtapa` in Express.
- Request body validation with Zod and standard responses (`{ success: true, data }` or `{ success: false, error }`).
- Logical deletion (soft delete) using MikroORM `@Filter`.
- JWT authentication and role-based validation middleware.
- PostgreSQL `jsonb` field in `Articulo` for schema-free metadata extensibility.

### Out of Scope
- Physical database record deletion.
- Device offline synchronization.
- Setup of Raspberry Pi M2M authentication.

## Capabilities

### New Capabilities
- `api-core`: CRUD endpoints using Express and MikroORM v7, Zod input validation, standard JSON structures, kebab-cased Spanish paths, and PostgreSQL JSONB extensible attributes.
- `user-auth`: Authentication middleware (`authenticateJWT`) & role guard (`requireRoles`) utilizing `bcrypt` and `jsonwebtoken` libraries.

### Modified Capabilities
- None

## Approach

1. **Routing & Standards**: Expose kebab-cased Spanish endpoints (e.g., `/api/usuarios`, `/api/lineas-produccion`). Standardize responses.
2. **Input Validation**: Use Zod schemas with a generic `validateBody` middleware to intercept bad payloads at route definition level.
3. **Authentication**: Install `bcrypt` and `jsonwebtoken`. Apply `authenticateJWT` globally and protect endpoints using `requireRoles(...roles: UsuarioRol[])` decorator-guards.
4. **Logical Deletion**: Add a global `@Filter({ name: 'activo', cond: { activo: true }, default: true })` on all core entities. Delete controllers will set `activo = false` and execute `em.flush()`.
5. **Extensibility**: Define a `metadata` field using PostgreSQL `jsonb` type in `Articulo` to allow dynamic, extensible attributes without database migrations.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `package.json` | Modified | Add `bcrypt`, `jsonwebtoken` and `@types/` dependencies. |
| `src/middlewares/` | New | Create `auth.middleware.ts` and `validation.middleware.ts`. |
| `src/models/` | Modified | Add `@Filter` and `metadata` (JSONB) fields. |
| `src/controllers/` | New | Create controllers for the five core entities. |
| `src/services/` | New | Create business logic services handling CRUD and soft deletes. |
| `src/routes/` | New | Create and export routing rules. |
| `src/app.ts` | Modified | Wire new routes and middleware. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Logical delete key collisions | Low | Implement partial unique database indices filtered by `activo = true`. |
| JWT validation overhead | Low | Optimize token verification; use lightweight claims payload. |
| DB JSONB query complexity | Low | Index common JSONB subkeys using GIN indexes if needed. |

## Rollback Plan

Revert git commit using standard rollback commands and run down-migration to drop the added npm packages, routing tables, and database JSONB column changes.

## Dependencies

- Libraries: `bcrypt`, `jsonwebtoken`
- DevLibraries: `@types/bcrypt`, `@types/jsonwebtoken`

## Success Criteria

- [ ] All 5 core CRUD APIs successfully respond under Spanish kebab-cased routes.
- [ ] Attempts to physically delete any core entity are prevented, updating `activo: false` instead.
- [ ] Invalid request bodies are automatically rejected with a 400 Bad Request error.
- [ ] Endpoints are protected by JWT verification and role authorization constraints.
- [ ] Dynamic fields in `Articulo` are correctly persisted and queried via the `metadata` JSONB column.
