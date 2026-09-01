# Delta for persistence-core

## ADDED Requirements

### Requirement: Pasada and LineaProduccion Observacion Columns

The system MUST persist two new nullable text columns: `pasada.observacion` and `linea_produccion.observacion`, added via a reversible migration (`up()` adds both columns as `text null`, `down()` drops both). Neither column has a length cap or an audit trail of edits.

#### Scenario: Persist pasada with null observacion by default
- GIVEN a new `Pasada` created without an `observacion` value
- WHEN the pasada is persisted
- THEN the `observacion` column MUST be `null`

#### Scenario: Persist linea_produccion with a non-null observacion
- GIVEN a new `LineaProduccion` created with `observacion: "línea reservada para lote especial"`
- WHEN the línea is persisted
- THEN the `observacion` column MUST store that exact text value with no truncation

#### Scenario: Migration rollback removes both columns
- GIVEN the migration adding both `observacion` columns has been applied
- WHEN the migration's `down()` is run
- THEN both `pasada.observacion` and `linea_produccion.observacion` columns MUST no longer exist, with no data-loss handling required since both are additive and nullable
