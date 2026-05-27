# Tasks: Fase I - Setup de Infraestructura

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 150 - 250 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

## Phase 1: Foundation & Project Init

- [x] 1.1 Ejecutar `pnpm init` y ajustar `package.json` con metadatos del proyecto.
- [x] 1.2 Instalar dependencias de producción: `express`, `@mikro-orm/core`, `@mikro-orm/postgresql`, `@mikro-orm/migrations`, `zod`, `dotenv`, `cors`.
- [x] 1.3 Instalar dependencias de desarrollo: `typescript`, `ts-node`, `vitest`, `@types/express`, `@types/node`, `@types/cors`, `eslint`, `prettier`.
- [x] 1.4 Crear `tsconfig.json` con soporte para decoradores (`experimentalDecorators`, `emitDecoratorMetadata`).
- [x] 1.5 Crear `.env.example` con variables para DB (puerto 5433), JWT y puerto de la API.

## Phase 2: Docker & Infrastructure

- [x] 2.1 Crear `docker-compose.yaml` con servicio PostgreSQL 15 mapeado al puerto `5433:5432`.
- [x] 2.2 Crear `.gitignore` excluyendo `node_modules`, `.env` y dist.

## Phase 3: MikroORM & Entry Points

- [x] 3.1 Crear `mikro-orm.config.ts` con configuración base para PostgreSQL y path de entidades/migraciones.
- [x] 3.2 Crear estructura de directorios en `src/`: `controllers`, `models`, `services`, `routes`, `middlewares`, `config`, `utils`.
- [x] 3.3 Crear `src/app.ts` inicializando Express y middlewares básicos (JSON, CORS).
- [x] 3.4 Crear `src/index.ts` para bootstrap del servidor y conexión inicial al ORM.

## Phase 4: Verification

- [x] 4.1 Configurar script de `test` en `package.json` usando `pnpm vitest`.
- [x] 4.2 Crear test de integración simple `src/app.test.ts` para verificar que la API responde 200 en un endpoint de salud.
