# Backend lint baseline

ESLint now checks the backend's TypeScript and JavaScript files, including tests,
scripts, and root configuration. Existing application and test code is unchanged.

## Run checks

```sh
pnpm lint
node --test scripts/eslint-config.test.mjs
pnpm exec tsc --noEmit
```

The lint command currently exits with code **1** because of existing findings.
An ESLint configuration or execution failure uses code **2** instead. Do not treat
the current findings as a passing quality gate.

## Configuration

- `eslint.config.js` uses ESM and flat configuration.
- JavaScript uses ESLint recommended rules; TypeScript additionally uses
  `@typescript-eslint/eslint-plugin`'s flat recommended preset and its parser.
- Node globals are available. Tests import their Vitest helpers explicitly.
- Generated `dist/`, `coverage/`, and installed dependencies are excluded.
- The existing `eslint . --ext .ts` script is unchanged; ESLint 10 supports it.
- `@eslint/js` and `globals` are direct development dependencies. The existing
  TypeScript plugin and parser are reused; no umbrella package is required.
- No type-aware preset, automatic fixes, blanket rule suppression, or application
  behavior changes are included. Formatting remains a separate concern.

## Initial findings

Measured against backend `main` at `c330214` with this configuration:

| Area | Explicit `any` | Unused bindings | Useless assignment | Total |
| --- | ---: | ---: | ---: | ---: |
| Tests: 30 affected files | 189 | 8 | 0 | 197 |
| Production: 7 affected files | 0 | 15 | 1 | 16 |
| Total: 37 affected files | 189 | 23 | 1 | 213 |

The scan covered **153 files**, with **0 warnings** and **0 fatal parsing errors**.
These numbers describe this baseline, not a permanent expected error budget.

### Production findings need context

- `src/services/usuario.service.ts:74,85`: unused destructured `esSistema` and
  `pin` bindings exclude fields from the remaining object. Removing the omission
  mechanism can change payloads or expose sensitive fields.
- `src/services/ruta-pasada.service.ts:133`: the omitted `id` similarly protects
  the shape of update data. Preserve that behavior during cleanup.
- `src/routes/muestras.routes.ts:6` and
  `src/routes/rutas-pasadas-etapas.routes.ts:6`: unused imports.
- `src/controllers/base.controller.ts:26,35,49`: caught errors are unused while
  generic 500 responses are returned. Better error observability is a separate
  behavior decision, not something the lint warning proves is broken.
- `src/services/muestra.service.ts:37`: the initial empty `allRutas` array is
  overwritten before its only read. This is redundant initialization, not a
  demonstrated failure in stage validation.

### Test debt dominates

All 189 explicit-`any` findings are in tests. The largest affected files are
`dashboard.controller.test.ts` (34 findings), `linea-produccion.service.test.ts`
(30), and `reporte.controller.test.ts` (22).

Typed fixtures and mocks should replace casts incrementally. Passing tests with
`any` do not prove their fixture contracts remain accurate; conversely these
casts alone do not demonstrate a production defect.

## Verification and limits

The configuration regression test failed before the config existed and passed
afterward. An independent scratch-copy check reproduced the counts, confirmed
Node and legacy-decorator parsing, and checked that the configured rules detect
deliberate violations. `tsc --noEmit` also passed.

No integration tests or coverage run is included: Vitest explicitly disables
file parallelism because tests share a database. A worktree does not isolate
that database, and no environment secrets were copied into this worktree.

Dependency installation reported an existing peer mismatch: Vitest 4.1.7 versus
`@vitest/coverage-v8` 4.1.9. This setup does not change those versions.

This is a whole-tree static lint baseline, not certification of runtime behavior,
security, database correctness, or test coverage. Business-code cleanup and local
merge remain separate follow-up work.
