# Design: Core CRUD API & Role Authentication (`fase-2-api`)

## Technical Approach
Implement five secure CRUD interfaces (`Usuario`, `Articulo`, `Etapa`, `LineaProduccion`, `RutaPasadaEtapa`) in Express using controllers, services, and Zod validator middlewares. Logical deletion is enforced globally at the ORM layer, combined with application-level checks to prevent integrity issues.

## Architecture Decisions

| Option | Tradeoff | Decision |
|--------|----------|----------|
| **Logical Delete `@Filter`** | Auto-applied in queries vs requires developer diligence. | Use `@Filter({ name: 'activo', cond: { activo: true }, default: true })` on all models. |
| **Delete Rules (Logical Restrict)** | Soft-deleting parent entities could orphan child records. | Service-level verification checks for active references before setting `activo: false`. |
| **Articulo Extensibility** | PostgreSQL JSONB column vs dynamic schema tables. | Store free-form parameters in `metadata: Record<string, any>` using PostgreSQL JSONB. |
| **Authentication & RBAC** | Stateless JWT tokens in header vs stateful cookie sessions. | Expose `/api/auth/login`. Verify signatures in Express middleware; secure write ops via roles. |

## Data Flow
```
Client (Tablet/Pi/Admin) -> Express Route -> Zod Validation Middleware -> requireRoles Guard -> Controller -> Service -> MikroORM EM -> PostgreSQL (JSONB / Filters active)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Modify | Add `bcrypt`, `jsonwebtoken`, and `@types/` dependencies. |
| `src/models/Articulo.ts` | Modify | Add `@Filter` and `metadata?: Record<string, any>` JSONB property. |
| `src/models/Usuario.ts` | Modify | Add `@Filter` decorator. |
| `src/models/Etapa.ts` | Modify | Add `@Filter` decorator. |
| `src/models/LineaProduccion.ts` | Modify | Add `@Filter` decorator. |
| `src/models/RutaPasadaEtapa.ts` | Modify | Add `@Filter` decorator. |
| `src/middlewares/auth.middleware.ts` | Create | JWT authentication (`authenticateJWT`) & role guard (`requireRoles`). |
| `src/middlewares/validation.middleware.ts` | Create | Zod validation middleware (`validateBody`). |
| `src/services/auth.service.ts` | Create | Hashing checks & JWT signature generation. |
| `src/services/base.service.ts` | Create | Base abstract service implementing common CRUD & soft delete actions. |
| `src/services/{entity}.service.ts` | Create | Domain-specific services (e.g., `ArticuloService`, checking references before delete). |
| `src/controllers/{entity}.controller.ts` | Create | HTTP controller layer mappings. |
| `src/routes/{entity}.routes.ts` | Create | Express routers with kebab-cased routes. |
| `src/routes/index.ts` | Create | Standardized central router mounting. |
| `src/app.ts` | Modify | Inject central router, JSON error handler, and initialize middlewares. |

## Interfaces / Contracts

### JWT Payload
```typescript
interface JWTPayload {
  id: number;
  nombreUsuario: string;
  rol: 'operario' | 'jefe' | 'visualizacion' | 'administrador';
}
```

### Zod Schemas Skeleton (Draft)
```typescript
const UsuarioCreateSchema = z.object({
  nombreApellido: z.string().min(1),
  nombreUsuario: z.string().min(3),
  contrasena: z.string().min(6),
  rol: z.enum(['operario', 'jefe', 'visualizacion', 'administrador']),
  datosAdicionales: z.object({ preferences: z.any() }).optional()
});

const ArticuloSchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

const RutaPasadaEtapaSchema = z.object({
  articulo: z.number().int(),
  etapa: z.number().int(),
  orden: z.number().int(),
  pesoIdeal: z.number().positive(),
  pesoMinimo: z.number().positive(),
  pesoMaximo: z.number().positive(),
  cantidadMuestrasRequeridas: z.number().int().positive()
});
```

### API Response Structure
```typescript
interface StandardResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    details?: any;
  };
}
```

## Testing Strategy
Using Vitest and Supertest:
1. **Unit/Integration**: Database schema filter synchronization tests. Verify that querying an entity with `activo: false` returns `null` or empty arrays by default.
2. **Endpoint Tests**:
   - `POST /api/auth/login`: verifies JWT generation, rejects inactive users.
   - `POST /api/articulos`: validates Zod schema (rejections return HTTP 400).
   - `DELETE /api/articulos/:id`: checks that logical soft-deletion sets `activo: false`.
   - `DELETE /api/articulos/:id (Restricted)`: tries to delete a active `Articulo` bound to a `RutaPasadaEtapa` and expects an HTTP 400 rejection (logical restrict).
   - JWT Guards: verifies accessing admin-only writes with `operario` token returns HTTP 403.
