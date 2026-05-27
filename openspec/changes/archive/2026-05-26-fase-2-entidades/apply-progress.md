# Apply Progress: Core Domain Entities & MikroORM Setup

We have successfully implemented all tasks under the `fase-2-entidades` change. Below is the detailed breakdown of the actions, architectural choices, and verification results.

## Summary of Completed Tasks

- **Base Entities (Phase 1)**
  - `src/models/Usuario.ts` (tableName: `'usuario'`): Created with `UsuarioRol` enum, logical deletion (`activo: boolean = true`), and PostgreSQL `jsonb` field `datosAdicionales` with custom strongly-typed interface `UsuarioMetadata`.
  - `src/models/LineaProduccion.ts` (tableName: `'linea_produccion'`): Created with unique scale number constraint (`numeroBalanza`) and `activo` flag.
  - `src/models/Articulo.ts` (tableName: `'articulo'`): Base product entity created.
  - `src/models/Marca.ts` (tableName: `'marca'`): Brand classification created with a unique `nombre` constraint.
  - `src/models/Etapa.ts` (tableName: `'etapa'`): Created to map active weighing stages of production.

- **Relational & Dependent Entities (Phase 2)**
  - `src/models/ArticuloMarca.ts` (tableName: `'articulo_marca'`): Explicit bridge entity mapped with autoincremental primary key `id` and compound unique constraint on `(articulo, marca)`.
  - `src/models/RutaPasadaEtapa.ts` (tableName: `'ruta_pasada_etapa'`): Configured with a compound unique constraint on `(articulo, etapa)`, sequential `orden`, and decimal-limit constraints mapped as `@Property({ columnType: 'decimal(8,3)', serializer: value => Number(value) })` to guarantee proper serialization to JS numbers and decimal precision bounds.
  - `src/models/index.ts`: Integrated index exporter exporting all 7 TypeScript classes and related enums/interfaces.

- **Verification & Integration Testing (Phase 3)**
  - Added `@mikro-orm/decorators` (`^7.1.1`) to `package.json` to correctly support native decorators as per MikroORM v7 specifications.
  - Switched `package.json` to `"type": "module"` to natively support ES module execution and test integration.
  - Created `src/models.test.ts` (Vitest integration tests) that:
    - Sets up a dedicated test database (`control_pesaje_test`).
    - Uses `SchemaGenerator` to drop and recreate the DB schema.
    - Asserts that all 7 entities are correctly discovered by the metadata analyzer.
    - Verifies CRUD and JSONB metadata retrieval on `Usuario`.
    - Verifies decimal rounding limits constraint on `RutaPasadaEtapa` (asserts that `12.3456` gets rounded to `12.346` at DB level and serialized cleanly as a JS `number`).
  - Refactored `src/app.test.ts` to use explicit entities list rather than filesystem scans to improve robustness and speed.

---

## Technical Approach & Architecture Review

1. **V7 Decorator Pattern**:
   We used standard TS experimental decorators (`@Entity`, `@PrimaryKey`, `@Property`, etc.) imported from the `@mikro-orm/decorators/legacy` package to maintain maximum metadata generation capabilities without relying on manual EntitySchema boilerplate.
   
2. **Explicit Joint Table vs Implicit ManyToMany**:
   As decided in our architecture plan, we declared `ArticuloMarca` explicitly. This protects relationships from synchronization issues, ensures autoincremental `id` as primary key, and makes room for future metadata expansion if needed.

3. **Decimal Bounds Rounding (Precision 8, Scale 3)**:
   By mapping decimal parameters using `@Property({ columnType: 'decimal(8,3)', serializer: value => Number(value) })`, we enforce SQL-level decimal rounding. Furthermore, serializing the entity automatically transforms PostgreSQL decimal strings back to clean JS numbers, ensuring precision without sacrificing usability.

---

## File Status

| Path | Status | Role |
|------|--------|------|
| `src/models/Usuario.ts` | **CREATED** | Core user account and preference metadata |
| `src/models/LineaProduccion.ts` | **CREATED** | Scale-associated production line |
| `src/models/Articulo.ts` | **CREATED** | Base product representation |
| `src/models/Marca.ts` | **CREATED** | Product branding classifications |
| `src/models/Etapa.ts` | **CREATED** | Weighing process phase definition |
| `src/models/ArticuloMarca.ts` | **CREATED** | Intermediary bridge table between Article and Brand |
| `src/models/RutaPasadaEtapa.ts` | **CREATED** | Configures targets, bounds, and ordering |
| `src/models/index.ts` | **CREATED** | Central models exports entry point |
| `src/models.test.ts` | **CREATED** | Vitest integration tests verifying 7-entity schema and data types |
| `src/app.test.ts` | **UPDATED** | Enhanced test config using explicit entity class arrays |
| `package.json` | **UPDATED** | Added `@mikro-orm/decorators` and `"type": "module"` for native ESM support |
| `openspec/changes/fase-2-entidades/tasks.md` | **UPDATED** | All items checked off as complete (`[x]`) |
