# Design: Fase I - Setup de Infraestructura

## Technical Approach

Inicializar un backend profesional en Node.js/TypeScript optimizado para MikroORM y una arquitectura MVC. El objetivo es dejar el entorno listo para implementar las entidades del Modelo v1.2 y la lógica de tiempo real.

## Architecture Decisions

| Decisión | Elección | Alternativas | Razón |
|----------|----------|--------------|-------|
| Runtime | Node.js (v20+) | Bun, Deno | Estabilidad, ecosistema de librerías (Socket.io, MikroORM) y soporte de producción. |
| Framework | Express | Fastify, NestJS | Simplicidad y flexibilidad para integrar WebSockets y MikroORM sin sobrecarga de boilerplate. |
| ORM | MikroORM v6 | TypeORM, Prisma | Soporte nativo para el patrón Data Mapper y Unit of Work, ideal para la lógica de "Orquestador de Contexto". |
| Testing | Vitest | Jest | Velocidad, soporte nativo de TS y compatibilidad con el ecosistema moderno. |
| DB | PostgreSQL 15 | MySQL, MongoDB | Requerimiento de arquitectura; excelente manejo de tipos DECIMAL para pesaje y robustez relacional. |

## Data Flow

```
[Request HTTP/Socket] ──→ [Express/Socket Middleware] ──→ [Controller]
                                                            │
                                                            ▼
[Database (Postgres)] ⬅── [MikroORM (Unit of Work)] ⬅── [Service/Model]
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Create | Definición de scripts, dependencias y metadata del proyecto. |
| `tsconfig.json` | Create | Configuración de TS (Strict mode, decorator support). |
| `docker-compose.yaml` | Create | Infraestructura local para PostgreSQL. |
| `mikro-orm.config.ts` | Create | Configuración centralizada para el ORM y migraciones. |
| `.env.example` | Create | Plantilla de variables de entorno. |
| `src/app.ts` | Create | Punto de entrada y configuración de Express. |
| `src/index.ts` | Create | Servidor HTTP y bootstrap del sistema. |

## Interfaces / Contracts

### Estructura de Carpetas (agents.md)
```text
src/
├── config/          # Environment vars, database connection
├── controllers/     # HTTP/Socket handlers
├── models/          # Entity definitions (MikroORM)
├── services/        # Business logic
├── middlewares/     # Auth, validation, logging
├── utils/           # Helpers
└── routes/          # API route definitions
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Helpers y utilidades | Vitest unit tests |
| Integration | Conexión a DB y salud de la API | Vitest + Supertest |

## Migration / Rollout

No migration required. Se utilizará el sistema de migraciones de MikroORM desde el inicio para gestionar el esquema de la base de datos de forma segura.

## Open Questions

- [ ] ¿Usaremos Socket.io o SSE para el tiempo real? (Architecture.md sugiere ambos, se decidirá en Fase III).
- [ ] ¿Necesitamos un sistema de caché (Redis) para el estado de las líneas en tiempo real o alcanza con memoria/DB? (Se evaluará en Fase IV).
