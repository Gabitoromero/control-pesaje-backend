# Apply Progress: Observacion Field on Pasada and LineaProduccion

**Mode**: Strict TDD
**Status**: 28/28 tasks complete. Ready for verify.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1-1.5 | N/A (structural: entities + migration) | N/A | N/A (new columns) | N/A — additive property/migration, no branching | ✅ `npx mikro-orm migration:create` generated matching `up()`/`down()` | Triangulation skipped: purely structural (property + generated SQL, one possible output) | ➖ None needed |
| 2.1-2.3 | `src/shared/schemas.test.ts` | Unit | ✅ 39/39 files, 483/493 pre-change (pre-existing unrelated failure) | ✅ Written (10 cases across 4 schemas) | ✅ 70/70 passed after GREEN | ✅ accept-string / accept-omit / accept-null / reject-empty per schema | ➖ None needed |
| 3.1-3.5 | `src/services/pasada.service.test.ts` | Integration (real Postgres, `control_pesaje_test`) | ✅ 5/5 baseline | ✅ Written (6 new cases) | ✅ 10/10 passed after GREEN | ✅ 4th-arg-passed / 4th-arg-omitted / completa / abortada / mixed-payload-rejected | ➖ None needed |
| 4.1-4.4 | `src/controllers/pasada.controller.test.ts` | Unit (mocked service) | ✅ 13/13 baseline (1 required fix: `toHaveBeenCalledWith(3,5,7,undefined)`) | ✅ Written (2 new cases) | ✅ 14/14 passed after GREEN | ✅ iniciar-forwards-observacion / update-forwards-observacion-in-rest | ➖ None needed |
| 5.1-5.5 | `src/services/linea-produccion.service.test.ts` | Unit (mocked EM) | ✅ 14/14 baseline | ✅ Written (4 new cases) | ✅ 16/16 passed after GREEN | ✅ create-persists / create-defaults-null / update-sets / update-clears-null | ➖ None needed |
| 5.3-5.4 | `src/controllers/linea-produccion.controller.test.ts` (new file) | Unit (mocked service + mocked device-pairing/socket) | N/A (new file) | ✅ Written (4 cases: list, list-null, getOne, assignDevice) | ✅ 4/4 passed after GREEN | ✅ non-null / null / getOne / assignDevice shape | ➖ None needed |
| 6.1-6.3 | `src/controllers/reporte.controller.test.ts` | Integration (real `reporteService` against workbook, mocked EM) | ✅ 5/5 baseline | ✅ Written (3 new cases) | ✅ 8/8 passed after GREEN | ✅ header-position+row-value / null-dash / no-linea-observacion-leak | ➖ None needed |

## Test Summary
- **Total tests written**: 29 new test cases (10 schema + 6 pasada.service + 2 pasada.controller + 4 linea-produccion.service + 4 linea-produccion.controller [new file] + 3 reporte.controller)
- **Total tests passing**: 509/511 in the full suite (`pnpm test run`); the 2 failures are pre-existing (`src/models.test.ts` decimal-rounding assertions), confirmed unrelated via `git stash` + re-run on the clean tree.
- **Layers used**: Unit (23), Integration (6, real-DB or real-service-against-mocked-EM)
- **Approval tests** (refactoring): None — no refactoring tasks; `PasadaService.update()` change is additive (new allowlist branch), covered by the existing closed-pasada rejection tests which continued to pass unmodified.
- **Pure functions created**: 0 (all changes are property additions, allowlist checks, and DTO/report field wiring within existing service/controller functions)

## Completed Tasks

All 28 tasks across Phases 1-7 — see `tasks.md` for the full checklist (all marked `[x]`).

### Phase 1: Foundation — Migration & Models
- [x] 1.1-1.5 — Postgres reachable on `localhost:5433`; `observacion?: string | null` added to `Pasada` and `LineaProduccion`; migration `Migration20260901145048.ts` generated via `npx mikro-orm migration:create` (matches design's `up()`/`down()` exactly); `.snapshot-control_pesaje.json` regenerated.

### Phase 2: Schemas
- [x] 2.1-2.3 — `LineaProduccionCreateSchema`, `PasadaIniciarSchema`, `PasadaUpdateSchema` all extended with `observacion` per design (D6: no `.nullable()` on iniciar).

### Phase 3: PasadaService
- [x] 3.1-3.5 — `iniciarPasada` takes trailing optional `observacion?: string`; `update()` now allows an `observacion`-only allowlist exception on closed pasadas via `CAMPOS_EDITABLES_TRAS_CIERRE`.

### Phase 4: PasadaController
- [x] 4.1-4.4 — Fixed breaking assertion at line 80; `IniciarPasadaBody.observacion` added and forwarded as 4th positional arg; generic PUT already forwards `observacion` via `rest`.

### Phase 5: LineaProduccion service & DTOs
- [x] 5.1-5.5 — `create()` `finalData` allowlist now includes `observacion`; `toLineaDto()` and `assignDevice` inline shape both list `observacion` explicitly; new `linea-produccion.controller.test.ts` guards both DTO shapes.

### Phase 6: Excel report
- [x] 6.1-6.3 — New `Observación`/`observacionInicio` column inserted right after `N° Pasada`; `Observación Cierre`/`obs` column untouched at the end; no `LineaProduccion.observacion` reference added anywhere in the report.

### Phase 7: Full Verification
- [x] 7.1-7.3 — Full suite run, lint attempted (blocked by pre-existing missing `eslint.config.js`), all 6 proposal Success Criteria manually cross-checked and confirmed.

## Files Changed

| File | Action | What Was Done |
|------|--------|----------------|
| `src/models/Pasada.ts` | Modified | Added `observacion?: string \| null` nullable text property after `observacionCierre`. |
| `src/models/LineaProduccion.ts` | Modified | Added `observacion?: string \| null` nullable text property after `activo`. |
| `src/migrations/Migration20260901145048.ts` | Created | Two `alter table ... add "observacion" text null` statements (pasada, linea_produccion) + matching `down()` drops. |
| `src/migrations/.snapshot-control_pesaje.json` | Modified (generated) | Regenerated by `mikro-orm migration:create`. |
| `src/shared/schemas.ts` | Modified | `observacion` added to `LineaProduccionCreateSchema`, `PasadaIniciarSchema`, `PasadaUpdateSchema`. |
| `src/shared/schemas.test.ts` | Modified | 10 new RED→GREEN cases across the 4 affected schemas. |
| `src/services/pasada.service.ts` | Modified | `iniciarPasada` 4th optional param + persistence; `update()` closed-state allowlist exception for `observacion`. |
| `src/services/pasada.service.test.ts` | Modified | 6 new cases: persist/omit on iniciar; edit-after-close on completa/abortada; mixed-payload rejection persists neither field. |
| `src/controllers/pasada.controller.ts` | Modified | `IniciarPasadaBody.observacion` + destructure + pass-through as 4th service arg. |
| `src/controllers/pasada.controller.test.ts` | Modified | Fixed breaking assertion (line 80) + 2 new cases (iniciar forwarding, PUT forwarding via `rest`). |
| `src/services/linea-produccion.service.ts` | Modified | `create()`'s `finalData` allowlist gains `observacion: rest.observacion ?? null`. `update()` unchanged (already spreads `rest`). |
| `src/services/linea-produccion.service.test.ts` | Modified | 4 new cases: create-persists, create-defaults-null, update-sets, update-clears-null. |
| `src/controllers/linea-produccion.controller.ts` | Modified | `observacion` added to `toLineaDto()` output and to the `assignDevice` inline response shape. |
| `src/controllers/linea-produccion.controller.test.ts` | Created | New file — DTO regression guard for `list`/`getOne`/`assignDevice` observacion exposure. |
| `src/services/reporte.service.ts` | Modified | New `{ header: 'Observación', key: 'observacionInicio' }` column inserted right after `N° Pasada`; row value `p.observacion ?? '-'` inserted right after `pasadaNum`. |
| `src/controllers/reporte.controller.test.ts` | Modified | 3 new integration cases: header position + row value, null-dash fallback, no-linea-observacion-leak guard. |

## Deviations from Design

None — implementation matches design exactly, including the D1-D6 architecture decisions (trailing positional param, key-allowlist diff, `string | null` typing, single migration file, distinct Excel key `observacionInicio`, no `.nullable()` on the iniciar schema).

## Issues Found

1. `pnpm lint` cannot run — the repository has no `eslint.config.js` anywhere (ESLint 10 requires flat config; no `.eslintrc.*` exists either). This is a pre-existing repo-wide gap unrelated to this change; confirmed by `git stash` + attempting lint on the clean tree (same failure). Out of scope for this SDD change — flagged for a separate follow-up.
2. `src/models.test.ts` has 2 pre-existing failing assertions (`pesoIdeal`/`pesoNeto` decimal-rounding expectations, e.g. expects `12.346` but Postgres returns `12.3456`). Confirmed pre-existing and unrelated to `observacion` via `git stash` + re-run on the clean tree (same 2 failures, same file, before any of this change's edits existed).

## Workload / PR Boundary

- Mode: single PR (within the 400-line budget; forecast was 180-260 lines, Low risk)
- Current work unit: Unit 1 — "Add `observacion` end-to-end (migration, models, schemas, services, controllers, report)"
- Boundary: starts at Phase 1 (migration/models), ends at Phase 7 (full verification) — the entire change ships as one deliverable slice, as forecast in `tasks.md`.
- Estimated review budget impact: within budget; no chaining required.
