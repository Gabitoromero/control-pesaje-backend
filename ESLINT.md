# Backend lint

ESLint checks the backend's TypeScript and JavaScript files, including tests,
scripts, and root configuration.

## Run checks

```sh
pnpm lint
node --test scripts/eslint-config.test.mjs
pnpm exec tsc --noEmit
```

`pnpm lint` exits with code **0** on a clean tree, so it can be used as a
quality gate. A non-zero code means findings (1) or a configuration or
execution failure (2).

## Configuration

- `eslint.config.js` uses ESM and flat configuration.
- JavaScript uses ESLint recommended rules; TypeScript additionally uses
  `@typescript-eslint/eslint-plugin`'s flat recommended preset and its parser.
- Node globals are available. Tests import their Vitest helpers explicitly.
- Generated `dist/`, `coverage/`, and installed dependencies are excluded.
- `@typescript-eslint/no-unused-vars` runs with `ignoreRestSiblings: true`:
  destructuring to drop fields (`const { id, ...rest } = input`) is an
  intentional idiom in the services, not dead code.
- `@eslint/js` and `globals` are direct development dependencies. The existing
  TypeScript plugin and parser are reused; no umbrella package is required.
- No type-aware preset, automatic fixes, or blanket rule suppression.
  Formatting remains a separate concern.
- `scripts/eslint-config.test.mjs` uses `node:test`, so Vitest excludes
  `scripts/**`.

## History

The first run, measured against backend `main` at `c330214`, reported 213 errors
in 37 of 153 files: 189 explicit `any` and 8 unused bindings in tests, plus 15
unused bindings and 1 useless assignment in production. All of them were fixed
without changing application behavior:

- Production: unused imports and `catch` bindings removed, `allRutas` scoped to
  the block that reads it, and the `db-teardown` query result typed.
- Tests: explicit `any` replaced with typed mocks (`vi.mocked`, `Mock`),
  `Parameters<Service['create' | 'update']>[0]` for partial service inputs, and
  small typed helpers for response bodies. Partial stubs use
  `as unknown as X`, which keeps the partial mock visible in the code.

## Limits

This is a static lint baseline, not certification of runtime behavior, security,
database correctness, or test coverage. The Vitest suite needs a PostgreSQL test
database (`control_pesaje_test`) and runs sequentially because tests share it.
