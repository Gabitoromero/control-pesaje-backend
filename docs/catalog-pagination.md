# Catalog pagination: coordinated API and UI migration

Backend and frontend will deploy together. The common pagination utility is implemented but **not connected to HTTP endpoints yet**: existing list responses still contain arrays. This document defines the migration target, not a claim that the full package is available.

## Target contract

Only users, articles, stages, routes and production lines opt in, including their inactive lists. Detail-by-ID and mutation endpoints keep their contracts and permissions. Balanzas, pasadas, general samples, reports and dashboard are outside this migration.

```json
{
  "success": true,
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "pageSize": 20
  }
}
```

| Query | Rule |
| --- | --- |
| `page` | Positive safe integer; default 1. Reject fractional, empty, array and nonnumeric values. |
| `pageSize` | Integer from 1 to 100; default 20. Reject oversized requests rather than silently clamping. |
| `q` | Trimmed search string, at most 100 characters; empty means no search constraint. |
| `searchField` | Optional public field from the catalog's explicit search allowlist; omitted means the catalog's global search. |
| `sortBy` | Public field from a catalog-specific allowlist; defaults to its first configured field. Never accept arbitrary DB expressions. |
| `sortDirection` | `asc` or `desc`; default `asc`. Append `id ASC` as a deterministic tiebreaker unless the requested order is already by ID. |

An invalid query returns the existing error envelope with HTTP 400 when catalog adapters are connected. Unsupported query keys are rejected. Catalog-specific filters extend the schema with `safeExtend`, preserving pagination validation. Reject unsafe offset arithmetic.

Apply active/inactive state, search and other filters in the database **before** ordering and limiting roots. Use identical predicates for the item query and total. `total` counts matching roots, not joined rows. An out-of-range page returns empty `items` and the correct `total`; the client then requests the last valid page. Do not load all records and slice them in memory.

## Consumer map and invariants

Paths below are relative to the backend or frontend repository, as indicated.

| Catalog | Frontend consumers | Preserve during migration |
| --- | --- | --- |
| Users | `src/api/usuarios.ts`, `src/features/dashboard/pages/UsuariosPage.tsx` | Name, username, legajo and role search; sector filter, including unknown sector codes shown as “Sin sector”; name ordering. |
| Articles | `src/api/articulos.ts`, `ArticulosPage.tsx`, `RutaFormPage.tsx`, `LineasPage.tsx`, tablet `HistorialPage.tsx` | Existing search fields; table code ordering; route membership/exclusions; selected labels outside the current page. |
| Stages | `src/api/etapas.ts`, `EtapasPage.tsx`, `RutaFormPage.tsx`, tablet `HistorialPage.tsx` | Name/description search; name ordering; previously configured route stages and history filters. |
| Routes | `src/api/rutas.ts`, `RutasPage.tsx`, `RutaFormPage.tsx`, `LineasPage.tsx` | Name/description search; name ordering; stage relations; by-ID editing and selected route labels. |
| Lines | `src/api/lineas.ts`, `LineasPage.tsx`, tablet `SeleccionLineaPage.tsx` | Live availability, assigned-device DTO, route/article relations, observation, socket invalidation and selected line. |

Unqualified administrative page names above live under `src/features/dashboard/pages/`. Check every actual import of these API functions again when migrating; the table is a starting inventory, not permission to ignore additional consumers.

### Backend boundaries

- Keep `BaseService.findAll`, `findAllInactive` and default `createCrudHandlers` behavior unchanged for out-of-scope callers. The new utility lives in `src/utils/pagination.ts` and is opt-in.
- Retain route-stage relations from `src/services/ruta-pasada.service.ts` and production-line relations from `src/services/linea-produccion.service.ts`. Limit distinct roots before loading to-many collections; verify totals with real relation fixtures.
- Preserve the line projection in `src/controllers/linea-produccion.controller.ts`, including `dispositivo: null` when unassigned and availability computed from current sessions.
- Route/article association reads are catalog consumers too. Replace full-array membership/exclusion checks with bounded filtered catalog queries or explicit by-ID membership checks; never download all pages to reconstruct a catalog.
- Preserve current permission middleware and mutation guards. No preventive schema migrations or indexes are part of this unit.

### Frontend boundaries

- Administrative tables request only the chosen state and current page. Query keys include search, field, state, sector, order and page. Changes to filters reset to page 1; CRUD/reactivation invalidates affected lists and corrects a now-empty last page.
- Add bounded remote mode to `src/components/SearchableCombobox.tsx`; preserve local mode for roles and small fixed lists. Remote search must not be filtered again by cmdk against only the current page.
- Debounce remote search, prevent stale responses from replacing newer results, bound cached pages, and retain selected labels through by-ID lookup or an explicit selected option. Keep keyboard navigation and error/retry behavior.
- Keep the tablet line query invalidation prefix used by socket events. Fetch a new bounded page without losing current availability or silently switching the selected line.
- Current table and selector orders are not uniform: tablet/selectors use numeric-natural comparison in places. Preserve those orders through explicit catalog adapter modes and regression fixtures; do not assume PostgreSQL collation equals JavaScript `localeCompare`.

## Rollout and verification

1. Land the common utility with focused validation and ORM-call tests; it changes no existing HTTP behavior.
2. Implement catalog adapters and migrate clients, tables, selectors and tablet behavior together on the feature branches. Add public-interface regression tests with each behavior.
3. Verify contract, inactive state, search beyond the first page, root counts, relationships, selected labels, mutations and live availability. Independently verify the consumed-contract change before completion.
4. In an isolated database, check emitted limits/offsets and count predicates, then measure a bounded volume/memory scenario. Unit mocks alone are not evidence of actual SQL or RAM improvement.
5. Deploy both repositories together only after all in-scope consumers use pages. No publishing or deployment is authorized by this document.

For the initial utility, rollback consists only of removing its two new source/test files and this document. Existing endpoint behavior remains unchanged. Progress and unresolved proof live in `codigo/odd/tasks/paginacion-get.md` outside both repositories.
