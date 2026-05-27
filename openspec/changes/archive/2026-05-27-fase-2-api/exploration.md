# CRUD API Core (`fase-2-api`) Design

This document details the architectural exploration and final decisions for the CRUD APIs of the core entities (`Usuario`, `Articulo`, `Etapa`, `LineaProduccion`, `RutaPasadaEtapa`) in the **Control de Pesaje** backend using Express and MikroORM v7.

## Quick Path

1. **Setup Dependencies**: Install `bcrypt`, `jsonwebtoken` (and their TypeScript types).
2. **Implement Filters & Middleware**: Define global MikroORM filters for logical deletion, Zod request body validation, and JWT validation & role authorization middlewares.
3. **Generate CRUD Modules**: Create routes, validation schemas (Zod), controllers, and services for each core entity under their respective `src/` subdirectories.
4. **Register Routes in Express**: Wire all routes in `src/app.ts`.

---

## 1. Routing & Directory Structure

To respect the English/Spanish naming rule ("Infraestructura y Código Técnico en Inglés, Dominio y Entidades en Español"), API routes will use pluralized, kebab-cased Spanish terms for endpoints, while keeping technical infrastructure filenames strictly in English.

### Endpoint Mapping:
- **Usuario**: `/api/usuarios`
- **Articulo**: `/api/articulos`
- **Etapa**: `/api/etapas`
- **LineaProduccion**: `/api/lineas-produccion`
- **RutaPasadaEtapa**: `/api/rutas-pasada-etapa`

### File & Directory Convention:
```text
src/
├── controllers/
│   ├── usuario.controller.ts
│   ├── articulo.controller.ts
│   └── ...
├── services/
│   ├── usuario.service.ts
│   ├── articulo.service.ts
│   └── ...
├── routes/
│   ├── usuario.routes.ts
│   ├── articulo.routes.ts
│   └── ...
├── schemas/
│   ├── usuario.schema.ts
│   ├── articulo.schema.ts
│   └── ...
└── middlewares/
    ├── auth.middleware.ts
    └── validation.middleware.ts
```

---

## 2. Validation & Response Payloads

Zod is already installed as a dependency in the project. We will leverage it to enforce robust input validation before request data reaches controllers.

### Schema Pattern
Each core entity will have dedicated request body validation schemas (e.g. `createUsuarioSchema`, `updateUsuarioSchema`).

### Generic Validation Middleware
We will build a simple, generic validation middleware:
```typescript
import { Request, Response, NextFunction } from 'express';
import { AnyZodObject } from 'zod';

export const validateBody = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync(req.body);
      next();
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        details: error.errors?.map((err: any) => ({
          field: err.path.join('.'),
          message: err.message
        }))
      });
    }
  };
};
```

### Standard Payload Format
To keep response structures predictable across all endpoints:
- **Success**: `{ success: true, data: ... }`
- **Error**: `{ success: false, error: "Error message", details: [...] }`

---

## 3. Authentication & Authorization

For authorization and secure access to our endpoints, we will introduce standard JWT validation and a role guard.

### Required Dependencies to Install
```bash
pnpm add jsonwebtoken bcrypt
pnpm add -D @types/jsonwebtoken @types/bcrypt
```

### Token Format
JWT payloads will store key identification claims:
```typescript
interface JWTPayload {
  id: number;
  rol: UsuarioRol;
}
```

### Authorization Middleware Design
We will define two key middlewares inside `src/middlewares/auth.middleware.ts`:
1. `authenticateJWT`: Validates authorization header (`Bearer <token>`), verifies the JWT signature, and attaches the decoded payload to the Express Request as `req.user`.
2. `requireRoles(...roles: UsuarioRol[])`: Asserts that `req.user.rol` matches the authorized roles required to execute the endpoint.

### Role CRUD Matrix
All core entities default to strict access based on roles:

| Endpoint | operario | jefe | visualizacion | administrador |
|----------|:--------:|:----:|:-------------:|:-------------:|
| `GET /api/usuarios` | ❌ | ❌ | ❌ | ✅ |
| `POST/PUT/DELETE /api/usuarios` | ❌ | ❌ | ❌ | ✅ |
| `GET /api/articulos` | ✅ | ✅ | ✅ | ✅ |
| `POST/PUT/DELETE /api/articulos` | ❌ | ✅ | ❌ | ✅ |
| `GET /api/etapas` | ✅ | ✅ | ✅ | ✅ |
| `POST/PUT/DELETE /api/etapas` | ❌ | ✅ | ❌ | ✅ |
| `GET /api/lineas-produccion` | ✅ | ✅ | ✅ | ✅ |
| `POST/PUT/DELETE /api/lineas-produccion` | ❌ | ❌ | ❌ | ✅ |
| `GET /api/rutas-pasada-etapa` | ✅ | ✅ | ✅ | ✅ |
| `POST/PUT/DELETE /api/rutas-pasada-etapa` | ❌ | ✅ | ❌ | ✅ |

---

## 4. Logical Deletion Integration

The system enforces soft deletion (`activo: boolean = true`). A physical `DELETE` operation in PostgreSQL is strictly prohibited to guarantee historical trace integrity.

### Options & Architectural Tradeoffs

| Approach | Pros | Cons | Complexity |
|----------|------|------|------------|
| **Option A: MikroORM Global Filters** (Recommended) | Define filter once on entities; automatically filters out `activo: false` records in all `find`, `findOne`, and relations; highly secure and DRY. | Requires explicit parameter override if we need to query logical-deleted records for audit logs. | Low |
| **Option B: Query-Level Filters** | Highly explicit; no automated database framework magic. | Extremely error-prone; must manually append `{ activo: true }` inside every single service, repository, and join query. | High |

### Recommended Implementation (Option A)
MikroORM v7 supports the `@Filter` decorator beautifully. We will declare this global filter on every core model:
```typescript
import { Filter } from '@mikro-orm/decorators/legacy';

@Entity({ tableName: 'articulo' })
@Filter({ name: 'activo', cond: { activo: true }, default: true })
export class Articulo {
  // ... properties
}
```

When implementing the `DELETE` endpoint in services, we execute logical deletion rather than calling `em.remove()`:
```typescript
async softDelete(id: number): Promise<void> {
  const entity = await this.em.findOneOrFail(Articulo, id);
  entity.activo = false;
  await this.em.flush();
}
```

---

## Risks & Mitigations

1. **Unauthenticated Raspberry Pi Weighing Clients**:
   - *Risk*: Raspberry Pi weighing units need to post data automatically. Forcing complex interactive JWT tokens onto remote embedded Raspberry scripts could break operations if network context is lost.
   - *Mitigation*: Raspberry Pi weight posts will go through a specific connection pipeline authenticated using a long-lived machine-to-machine (M2M) API Token or secure authorization token mapped to the `numeroBalanza` rather than standard user-based JWT.

2. **Logical Deletion Unique Constraint Collisions**:
   - *Risk*: If a `LineaProduccion` with `numeroBalanza: 5` is soft-deleted, trying to add a new `LineaProduccion` with `numeroBalanza: 5` will crash due to the PostgreSQL unique index collision.
   - *Mitigation*: We should define unique database indices selectively filtering for active rows using PostgreSQL partial indices (e.g. `CREATE UNIQUE INDEX ... WHERE activo = true`) instead of standard unique table columns.

---

## Ready for Proposal
**Yes**. The design is fully aligned with `AGENTS.md` and the existing codebase. We are ready to draft the formal implementation plan.
