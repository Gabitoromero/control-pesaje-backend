# Design: Autenticación en Dos Capas & Docker MVP

## Technical Approach

### 1. SesionService Memory Singleton & Operations
El backend mantendrá el estado de las sesiones operativas de planta en memoria dentro de un singleton `SesionService`. Este servicio gestionará las siguientes responsabilidades en memoria:
- Un mapa `lineasSessionMap` donde la clave es `lineaProduccionId` y el valor es el objeto `ActiveSession`:
  ```typescript
  interface ActiveSession {
    lineaProduccionId: number;
    usuarioIdGlobal: number;
    usuarioIdOperario: number | null;
    pasadaId: number | null;
    connectedAt: Date;
    operarioUltimaActividadAt: Date | null;
  }
  ```
  El `articuloId` no forma parte de la sesión — pertenece a la `Pasada`. Si se necesita saber el artículo en producción, se consulta la pasada activa de la línea.
- **Timeout Riguroso (5 Minutos)**: Cada vez que se consulta la sesión activa mediante `obtenerSesion(lineaId)`, el servicio validará si el operario excedió el límite de inactividad de 5 minutos (`new Date().getTime() - operarioUltimaActividadAt.getTime() > 300000`). Si excedió, se invalidará al operario (`usuarioIdOperario = null` y `operarioUltimaActividadAt = null`), regresando la línea a puesta a punto.
- **Exclusividad de Operario**: `iniciarSesion` detecta si el operario ya tiene sesión en otra línea y retorna `{ ok: false, conflict: { lineaProduccionId } }` en lugar de hacer evicción silenciosa. El controller expone un `409 Conflict` con los datos de la línea en conflicto para que el cliente ofrezca las dos opciones al usuario: cerrar la sesión previa y reintentar, o mantenerla y cancelar.
- **PIN Rate Limiting**: Un mapa `lineasFailedAttemptsMap` registrará los intentos fallidos de PIN por línea. Tras el 3er intento fallido consecutivo:
  - Se registra un timestamp de bloqueo en `lineasBlockedUntilMap`.
  - Toda llamada a `/api/auth/activar-sesion-operario` para esa línea será rechazada de inmediato con HTTP 429 durante los siguientes 5 minutos.

### 2. Docker & Container Network Design
Para simular producción en la oficina:
- **Dockerfile**:
  ```dockerfile
  # Stage 1: Build
  FROM node:20-alpine AS builder
  RUN npm install -g pnpm
  WORKDIR /app
  COPY package.json pnpm-lock.yaml tsconfig.json ./
  RUN pnpm install --frozen-lockfile
  COPY src ./src
  RUN pnpm build

  # Stage 2: Production Run
  FROM node:20-alpine AS runner
  RUN npm install -g pnpm
  WORKDIR /app
  ENV NODE_ENV=production
  COPY package.json pnpm-lock.yaml ./
  RUN pnpm install --prod --frozen-lockfile
  COPY --from=builder /app/dist ./dist
  COPY mikro-orm.config.ts ./
  EXPOSE 3000
  CMD ["pnpm", "start"]
  ```
- **Docker Compose (`docker-compose.yaml`)**:
  ```yaml
  services:
    postgres:
      image: postgres:15-alpine
      container_name: control-pesaje-db
      restart: always
      environment:
        POSTGRES_USER: pesaje_admin
        POSTGRES_PASSWORD: balanzas_control_2026_pwd!
        POSTGRES_DB: control_pesaje
      ports:
        - "5433:5432"
      volumes:
        - postgres_data:/var/lib/postgresql/data
      healthcheck:
        test: ["CMD-SHELL", "pg_isready -U pesaje_admin -d control_pesaje"]
        interval: 5s
        timeout: 5s
        retries: 5

    backend:
      build:
        context: .
        dockerfile: Dockerfile
      container_name: control-pesaje-api
      restart: always
      ports:
        - "3000:3000"
      environment:
        NODE_ENV: production
        PORT: 3000
        DB_HOST: postgres # Conexión interna
        DB_PORT: 5432
        DB_NAME: control_pesaje
        DB_USER: pesaje_admin
        DB_PASSWORD: balanzas_control_2026_pwd!
        JWT_SECRET: control_pesaje_2026_super_secret_jwt_key!
      depends_on:
        postgres:
          condition: service_healthy
      networks:
        - pesaje_net

  volumes:
    postgres_data:

  networks:
    pesaje_net:
      driver: bridge
  ```

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `[Dockerfile](file:///home/gtr/work/maciasoft/Controlador%20Pesaje/codigo/backend/Dockerfile)` | Create | Nuevo Dockerfile de construcción multi-stage. |
| `[docker-compose.yaml](file:///home/gtr/work/maciasoft/Controlador%20Pesaje/codigo/backend/docker-compose.yaml)` | Modify | Sincroniza servicios de Postgres y Backend interconectados. |
| `[src/services/sesion.service.ts](file:///home/gtr/work/maciasoft/Controlador%20Pesaje/codigo/backend/src/services/sesion.service.ts)` | Modify | Integra la gestión en memoria de sesiones, timeout por inactividad y rate limiting. |
| `[src/controllers/auth.controller.ts](file:///home/gtr/work/maciasoft/Controlador%20Pesaje/codigo/backend/src/controllers/auth.controller.ts)` | Modify | Implementa los controladores para los nuevos endpoints de autenticación de dos capas. |
| `[src/routes/auth.routes.ts](file:///home/gtr/work/maciasoft/Controlador%20Pesaje/codigo/backend/src/routes/auth.routes.ts)` | Modify | Mapea las rutas con los endpoints y sus validaciones con esquemas de Zod. |
| `[src/middlewares/auth.middleware.ts](file:///home/gtr/work/maciasoft/Controlador%20Pesaje/codigo/backend/src/middlewares/auth.middleware.ts)` | Modify | Robustece el middleware de autenticación JWT. |
| `[src/utils/schemas.ts](file:///home/gtr/work/maciasoft/Controlador%20Pesaje/codigo/backend/src/utils/schemas.ts)` | Create/Modify | Define los Zod schemas de validación de datos para la autenticación de dos capas. |
