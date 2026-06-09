# Exploration: rediseno-auth-v1-5-backend

**Date:** 2026-06-09
**Branch:** main
**Design reference:** `rediseno_auth_sesiones_v1_5.md`
**Current spec:** `backend/openspec/specs/user-auth/spec.md`

---

## 1. Current State Map

### 1.1 `src/models/Usuario.ts`

| Field | Decorator | Type | Nullable | v1.5 note |
|---|---|---|---|---|
| `id` | `@PrimaryKey` | number, autoincrement | No | — |
| `nombreApellido` | `@Property` | string(100) | No | — |
| `nombreUsuario` | `@Unique @Property` | string(50) | No | — |
| `legajo` | `@Unique @Property` | string(50) | **YES** | v1.5: NOT NULL |
| `contrasenaHash` | `@Property` | string(255) | No | v1.5: DROP |
| `pinHash` | `@Property` | string(255) | **YES** | v1.5: NOT NULL |
| `puedeTomarMuestrasLibres` | `@Property` | boolean | No | default false |
| `rol` | `@Enum` | `UsuarioRol` | No | native enum `usuario_rol_enum` |
| `activo` | `@Property` | boolean | No | default true |
| `datosAdicionales` | `@Property` | jsonb | YES | Not in v1.5 table — OPEN QUESTION |

`UsuarioRol`: const-type pattern `OPERARIO | JEFE | VISUALIZACION | ADMINISTRADOR`.

### 1.2 `src/services/auth.service.ts`
- `login(nombreUsuario, contrasena)` (10–42): finds by `$or: [{nombreUsuario},{legajo}]`, checks `activo`, bcrypt vs `contrasenaHash`, signs JWT `{id, nombreUsuario, rol, puedeTomarMuestrasLibres}` at **20h**. Returns `string|null`.
- `validatePin(legajo, pin)` (44–55): finds `{legajo, activo:true}`, bcrypt vs `pinHash`. Returns `Usuario|null`. Null-safe.
- `findLineaById(id)` (57–63).
- `hashPassword(plain)` (65–67): bcrypt 10 rounds.

### 1.3 `src/controllers/auth.controller.ts`
| Handler | Method | v1.5 |
|---|---|---|
| `login` (8) | POST `/api/auth/login` | Rewrite → legajo+PIN |
| `verificarPin` (25) | POST `/api/auth/verificar-pin` | Remove |
| `activarSesion` (54) | POST `/api/auth/activar-sesion` | Remove |
| `cerrarSesion` (152) | POST `/api/auth/cerrar-sesion` | Keep, simplify |
| `getActiveSesion` (191) | GET `/api/auth/sesion-activa/:lineaId` | Keep, simplify |

`activarSesion` uses a second `globalSessions` Map for non-operario roles — disappears in v1.5.

### 1.4 `src/services/sesion.service.ts`
`SesionActiva` (3–11):
```typescript
interface SesionActiva {
  lineaProduccionId: number | null;
  usuarioIdGlobal: number;          // DROP
  usuarioIdUsuario: number | null;  // → usuarioId
  rolUsuario: UsuarioRol | null;    // → usuarioRol
  pasadaId: number | null;
  connectedAt: Date;
  usuarioUltimaActividadAt: Date | null; // → ultimaActividadAt
}
```
Singleton with `lineSessions` + `globalSessions` Maps. Methods: `iniciarSesion`, `cerrarSesion`, `cerrarSesionGlobal` (remove), `obtenerSesion` (lazy 5-min check, only OPERARIO at line 93), `obtenerSesionGlobal` (remove), `obtenerSesionPorUsuario`, `actualizarActividad`, `actualizarPasada`. Rate-limiting: `failedAttempts`+`lockExpires` keyed by `lineaId`, 3 strikes → 5 min.

### 1.5 `src/middlewares/auth.middleware.ts`
`JWTPayload { id, nombreUsuario, rol }`. `authenticateJWT` + `requireRoles`. `puedeTomarMuestrasLibres` is signed into token but NOT declared in `JWTPayload` — latent mismatch.

### 1.6 `src/routes/auth.routes.ts`
```
POST /api/auth/login              validateBody(LoginSchema)
POST /api/auth/verificar-pin      authenticateJWT + VerificarPinSchema
POST /api/auth/activar-sesion     authenticateJWT + ActivarSesionSchema
POST /api/auth/cerrar-sesion      authenticateJWT + CerrarSesionSchema
GET  /api/auth/sesion-activa/:lineaId  authenticateJWT
```

### 1.7 `src/utils/schemas.ts`
`LoginSchema` (nombreUsuario+contrasena), `VerificarPinSchema` (legajo+pin), `ActivarSesionSchema`, `CerrarSesionSchema`.

### 1.8 `src/shared/schemas.ts` — `UsuarioCreateSchema`
`contrasena: min(4)` required; `legajo: optional`; `pin: optional`. v1.5: contrasena out, legajo+pin required.

### 1.9 `src/seed.ts`
5 users seeded with both `contrasenaHash` and `pinHash`. v1.5: drop contrasenaHash, ensure legajo+pinHash.

### 1.10 `src/services/usuario.service.ts`
`mapCredentials()` (38–56): handles `contrasena→contrasenaHash` and `pin→pinHash`. Remove password branch.

### 1.11 Migration state
Only `Migration20260527133000.ts` (pasada/muestra). `usuario` table created by schema generation, no migration. **New migration required**: drop `contrasena_hash`, `pin_hash NOT NULL`, `legajo NOT NULL`.

---

## 2. Migration Impact Per File

| File | Action |
|---|---|
| `Usuario.ts` | Remove `contrasenaHash`; `legajo`/`pinHash` → non-nullable |
| `auth.service.ts` | Major rewrite: PIN login emits JWT at 12h; remove password login + hashPassword |
| `auth.controller.ts` | Rewrite login; remove verificarPin+activarSesion; simplify cerrarSesion+getActiveSesion; add actividad handler |
| `sesion.service.ts` | Rename fields → usuarioId/usuarioRol/ultimaActividadAt; remove globalSessions + global methods; lazy-check applies to jefe too; iniciarSesion drops usuarioIdGlobal |
| `auth.routes.ts` | Remove verificar-pin+activar-sesion; add PATCH /actividad |
| `utils/schemas.ts` | New LoginSchema (legajo+pin); remove VerificarPin/ActivarSesion; add ActividadSchema |
| `shared/schemas.ts` | UsuarioCreateSchema: contrasena out, legajo+pin required |
| `usuario.service.ts` | Remove contrasena branch in mapCredentials |
| `seed.ts` | Drop contrasenaHash |
| `migrations/` | New v1.5 migration |

---

## 3. New Endpoint: PATCH /api/auth/actividad
Resets `ultimaActividadAt` for an active line session. Route after `cerrar-sesion`: `PATCH /api/auth/actividad` with `authenticateJWT + ActividadSchema { lineaProduccionId }`. Handler calls existing `actualizarActividad(lineaProduccionId)`; 200 `{success:true}` or 404 if no session.

---

## 4. Risks and Open Questions

- **CRITICAL — DB migration ordering:** rows have `contrasena_hash`; `pin_hash` may be null. Must backfill `pin_hash` before `SET NOT NULL`, or migration fails.
- **OPEN — Rate limiting for unified login:** current limiter keyed by `lineaProduccionId`, but there is no line at login time. Need new key (legajo / IP). Not specified in v1.5 doc.
- **OPEN — jefe/admin in-memory session:** globalSessions removed. Does backend track jefe/admin sessions in memory in v1.5, or is JWT sufficient? Affects how jefe timeout works.
- **OPEN — jefe inactivity timeout:** v1.5 §4.1 says jefe IS subject to 5-min timeout, but current lazy-check only fires for OPERARIO. Inverts existing test.
- **OPEN — `datosAdicionales` jsonb:** not in v1.5 table. Keep?
- **OPEN — `puedeTomarMuestrasLibres` in JWT:** declare in JWTPayload or drop?
- JWT expiry 20h → 12h: in-flight tokens live longer post-deploy. Low risk.

---

## 5. Test Surface for Strict TDD

Existing: `auth.service.test.ts` (9), `sesion.service.test.ts` (11), `auth.middleware.test.ts` (5), `api.test.ts` (~40 incl. 2FA block of 8), `app.test.ts`, `models.test.ts`.

Will break: AuthService.login password tests; validatePin null-pin test; sesion "non-operario not invalidated" test; "global session jefe/admin" test; api.test 2FA block + activar-sesion; login body-shape test.

New tests needed: PIN login (success/bad legajo/wrong pin/inactive/12h claims); jefe timeout fires; PATCH actividad (200/404/401); simplified cerrar-sesion; removed routes → 404; UsuarioCreateSchema legajo+pin required; usuario.service create without contrasena.
