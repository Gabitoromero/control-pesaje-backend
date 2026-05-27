# Verify Report: fase-2-api

**Status**: PASS (with fixes applied during verification)
**Date**: 2026-05-27
**Tests**: 37/37 passing | Build: clean

## Fixes Applied During Verification

### FIX 1 — CRITICAL (resolved): TS2883 build errors in 7 files
**Root cause**: `declaration: true` in tsconfig forces `.d.ts` emission. Inferred types for `const router = Router()` and return type of `createCrudHandlers()` resolved to internal pnpm paths (`@types/express-serve-static-core`).
**Fix**: Added `CrudHandlers` interface in `base.controller.ts`; annotated `const router: Router = Router()` in all 6 route files.

### FIX 2 — CRITICAL (resolved): Vitest picking up `dist/` compiled tests
**Root cause**: No `vitest.config.ts`. After successful `pnpm build`, Vitest discovered compiled test files in `dist/`. Running `models.test.ts` twice against the same DB caused the second run to fail on `drop()`.
**Fix**: Created `vitest.config.ts` with `exclude: ['dist/**', 'node_modules/**']`.

## Spec Compliance Matrix

### api-core
| Requirement | Status |
|-------------|--------|
| 5 CRUD endpoints (GET/POST/PUT/DELETE) | ✅ |
| Zod validation on POST/PUT | ✅ |
| Articulo metadata JSONB field | ✅ |
| Invalid payload → 400 | ✅ |
| Standard `{success, data}` response | ✅ |
| Standard `{success, error}` error | ✅ |
| Soft-delete (activo=false) | ✅ |
| @Filter(activo, default:true) on 5 entities | ✅ |

### user-auth
| Requirement | Status |
|-------------|--------|
| Login at /api/auth/login | ✅ |
| Inactive users blocked | ✅ |
| JWT returned on success | ✅ |
| bcrypt 10 salt rounds | ✅ |
| JWT middleware (Bearer, 401) | ✅ |
| JWT claims: id, rol | ✅ |
| JWT claim `username` | ⚠️ Uses `nombreUsuario` (intentional Spanish convention) |
| 401 on invalid/expired token | ✅ |
| requireRoles guard | ✅ |
| 403 on unauthorized role | ✅ |
| Role table per endpoint | ✅ |

## Warning (non-blocking)
JWT payload uses `nombreUsuario` instead of `username`. Intentional — follows project domain convention (CLAUDE.md: Spanish domain terms). Frontend must look for `nombreUsuario` when decoding the token.
