# Proposal: Rediseño de Autenticación y Sesiones v1.5 — Backend

## Why

El sistema actual mantiene **dos capas de autenticación independientes**: Capa 1 (usuario + contraseña larga → JWT) y Capa 2 (legajo + PIN → sesión operativa en memoria, con un paso separado de activación). Esta arquitectura agrega fricción operativa innecesaria: la planta opera en una **red interna controlada** (el servidor rechaza conexiones externas a nivel de firewall), por lo que mantener contraseñas largas para operarios no aporta seguridad real y sí complica el día a día.

v1.5 colapsa ambas capas en un **login único de legajo + PIN** que emite directamente un JWT de 12 horas. Esto elimina código muerto (sesiones globales en memoria, endpoint de activación de PIN), corrige un type mismatch latente en el `JWTPayload`, y deja la tabla `usuario` sin campos nulleables. El backend se simplifica y queda alineado con el contexto real de despliegue.

Esta propuesta cubre **únicamente el repositorio backend**. El cambio de frontend es una propuesta separada y encadenada que depende de los contratos definidos acá. Antes de aplicar, se crea la branch de snapshot `archive/auth-two-layer` para preservar la arquitectura v1.4 (no es una tarea de código; ver Impact).

**Éxito** = login unificado legajo+PIN funcionando con JWT 12h, sesión en memoria solo para el flujo de línea (operario/jefe con timeout de 5 min), endpoints de Capa 2 obsoletos eliminados, migración de DB aplicada con backfill seguro, y suite de tests (vitest, strict TDD) verde con la nueva semántica.

## What Changes

### Modelo de datos — tabla `usuario` v1.5
- **DROP** `contrasenaHash` (`contrasena_hash`).
- `legajo` y `pinHash` (`legajo`, `pin_hash`) pasan a **NOT NULL**.
- Se conservan sin cambios `datosAdicionales` (jsonb) y todos los demás campos.
- La tabla `usuario` no queda con campos nulleables (salvo `datosAdicionales`, que se mantiene como hasta ahora).

### Autenticación — capa única
- **REESCRITURA** de `POST /api/auth/login`: recibe `legajo` + `pin`, valida contra `pinHash` (bcrypt), verifica `activo`, y emite un JWT firmado de **12h** (antes 20h).
- El JWT declara `puedeTomarMuestrasLibres` en el payload (se firmaba pero no estaba declarado en `JWTPayload` — **fix de type mismatch latente**).
- **ELIMINAR** `POST /api/auth/verificar-pin` y `POST /api/auth/activar-sesion` (Capa 2 separada).
- **RATE LIMITING re-keyado por LEGAJO**: 5 intentos fallidos → bloqueo de 3 minutos. Se reutiliza el limiter existente, pero la clave pasa de `lineaProduccionId` a `legajo` (en login no hay línea aún).

### Sesión en memoria — solo flujo de línea
- La sesión en memoria, `PATCH /api/auth/actividad`, y el lazy-check de expiración a 5 min aplican **únicamente al flujo de línea de operario**.
- El backend **NO mantiene sesión en memoria para jefe/admin**: el JWT es suficiente. El timeout de inactividad de jefe/admin es **responsabilidad del frontend** (cambio en la propuesta de frontend, fuera de este alcance).
- **ELIMINAR** por completo el `Map` `globalSessions` y todos los métodos de sesión global (`cerrarSesionGlobal`, `obtenerSesionGlobal`).
- **Unificación de `SesionActiva`**:
  - `usuarioIdUsuario` → `usuarioId`
  - `rolUsuario` → `usuarioRol`
  - `usuarioUltimaActividadAt` → `ultimaActividadAt`
  - **DROP** `usuarioIdGlobal`
- `iniciarSesion` deja de poblar `usuarioIdGlobal`.

### Endpoints de sesión
- **NUEVO** `PATCH /api/auth/actividad` con body `{ lineaProduccionId }`: resetea `ultimaActividadAt` de la sesión de línea activa. 200 si existe sesión, 404 si no.
- **MANTENER + SIMPLIFICAR** `POST /api/auth/cerrar-sesion` (sin lógica de Capa 2).
- **MANTENER + SIMPLIFICAR** `GET /api/auth/sesion-activa/:lineaId` (refleja la `SesionActiva` unificada).

### Validación (Zod 4)
- Nuevo `LoginSchema` (`legajo` + `pin`); eliminar `VerificarPinSchema` y `ActivarSesionSchema`; nuevo `ActividadSchema` (`lineaProduccionId`).
- `UsuarioCreateSchema`: quitar `contrasena`; `legajo` y `pin` pasan a requeridos.
- `usuario.service.mapCredentials`: eliminar la rama de `contrasena → contrasenaHash`.

### Migración de DB (orden crítico)
1. **Backfill** de `pin_hash` para filas existentes **antes** de cualquier `SET NOT NULL`.
2. Aplicar `legajo NOT NULL` y `pin_hash NOT NULL`.
3. **DROP** `contrasena_hash`.

El orden es no negociable: invertirlo (NOT NULL antes del backfill) hace fallar la migración sobre datos existentes.

### Seed y limpieza
- `seed.ts`: dejar de generar `contrasenaHash`; garantizar `legajo` + `pinHash` para los 5 usuarios.
- Eliminar `hashPassword` y la rama de login por contraseña en `auth.service.ts`.

### Affected specs
- **MODIFIED** `user-auth`: se reescribe el spec para eliminar la Capa 1 / Capa 2 separadas y reflejar el login unificado legajo+PIN, el `PATCH /api/auth/actividad`, la `SesionActiva` unificada y el rate-limiting por legajo. Las requirements de Docker MVP y RBAC se mantienen.

## Impact

### Código afectado (backend)
| Archivo | Acción |
|---|---|
| `src/models/Usuario.ts` | DROP `contrasenaHash`; `legajo`/`pinHash` NOT NULL |
| `src/services/auth.service.ts` | Reescribir login a legajo+PIN, JWT 12h; eliminar login por contraseña y `hashPassword` |
| `src/controllers/auth.controller.ts` | Reescribir login; eliminar `verificarPin`/`activarSesion`; simplificar `cerrarSesion`/`getActiveSesion`; agregar handler `actividad` |
| `src/services/sesion.service.ts` | Renombrar campos; eliminar `globalSessions` + métodos globales; lazy-check aplica a operario y jefe del flujo de línea; `iniciarSesion` sin `usuarioIdGlobal`; re-key del limiter a legajo |
| `src/middlewares/auth.middleware.ts` | Declarar `puedeTomarMuestrasLibres` en `JWTPayload` |
| `src/routes/auth.routes.ts` | Eliminar `verificar-pin`/`activar-sesion`; agregar `PATCH /actividad` |
| `src/utils/schemas.ts` | Nuevo `LoginSchema` (legajo+pin); eliminar `VerificarPin`/`ActivarSesion`; nuevo `ActividadSchema` |
| `src/shared/schemas.ts` | `UsuarioCreateSchema`: contrasena fuera, legajo+pin requeridos |
| `src/services/usuario.service.ts` | Eliminar rama de contrasena en `mapCredentials` |
| `src/seed.ts` | Eliminar `contrasenaHash` |
| `src/migrations/` | Nueva migración v1.5 (backfill → NOT NULL → drop) |

### Impacto en tests (vitest, strict TDD)
La detalle fino lo resuelven las fases de spec y tasks. A alto nivel:
- **Romperán** (esperado): tests de login por contraseña en `auth.service.test.ts`; test de pin nulo en `validatePin`; test "sesión no-operario no se invalida" (ahora jefe sí expira); test de sesión global jefe/admin; bloque 2FA y `activar-sesion` en `api.test.ts`; test de forma del body de login.
- **Nuevos**: login PIN (éxito / legajo inválido / pin incorrecto / inactivo / claims 12h); expiración de jefe en flujo de línea; `PATCH /actividad` (200/404/401); `cerrar-sesion` simplificado; rutas eliminadas → 404; `UsuarioCreateSchema` requiere legajo+pin; creación de usuario sin contrasena.

### Prerrequisito operativo (no es tarea de código)
- Antes de aplicar, crear la branch de snapshot **`archive/auth-two-layer`** capturando el estado v1.4 completo (código + `openspec/` + docs de diseño). Esta branch no recibe commits nuevos ni se fusiona a `main`.

### Riesgos
- **Migración sobre datos existentes (CRÍTICO):** filas con `pin_hash` nulo harían fallar el `SET NOT NULL`. Mitigado por el orden backfill → NOT NULL → drop.
- **Tokens en vuelo:** el cambio 20h → 12h hace que tokens emitidos antes del deploy vivan más que la nueva política. Riesgo bajo (red interna, sin sesiones de larga duración).
- **Cambio de contrato para frontend:** el frontend depende de los nuevos shapes de login y sesión. Se coordina vía la propuesta de frontend encadenada.

### Out of Scope
- Cualquier cambio en el repositorio **frontend** (timeout de jefe/admin, modal de inactividad, redirección post-login por rol).
- Cambios en entidades de dominio distintas de `usuario` (pasada, muestra, ruta, etc.).
- Reconfiguración de Docker / infraestructura: las requirements de contenedor del spec `user-auth` se mantienen sin cambios.
