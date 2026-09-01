# observaciones-operativas Specification

## Purpose

Define the capture, exposure, editability, and report-export rules for the two new operational `observacion` free-text notes: one on `Pasada` (captured at start) and one on `LineaProduccion` (a standing note on the line). Both are distinct from the existing `Pasada.observacionCierre` (set at close) and `Muestra.observacion` (per sample).

## Requirements

### Requirement: Pasada Observacion Capture at Start

The system MAY accept an optional `observacion` value when a pasada is started (`iniciarPasada` / `POST` iniciar flow), and MUST persist it as a nullable text field on `Pasada`, distinct from `observacionCierre`.

#### Scenario: Iniciar pasada with observacion
- GIVEN a valid `iniciarPasada` request body including `observacion: "lote nuevo de materia prima"`
- WHEN the pasada is started
- THEN the system MUST persist the pasada with `observacion` set to that value

#### Scenario: Iniciar pasada without observacion
- GIVEN a valid `iniciarPasada` request body that omits `observacion`
- WHEN the pasada is started
- THEN the system MUST persist the pasada with `observacion` as `null` and MUST NOT reject the request

### Requirement: Pasada Observacion Editable After Close

The system MUST allow `PUT` updates to `Pasada.observacion` regardless of pasada state, while every other field MUST remain blocked once the pasada is `completa` or `abortada`.

#### Scenario: Edit observacion on a closed pasada
- GIVEN a pasada with `estado` = `completa` or `abortada`
- WHEN a `PUT` request updates only `observacion`
- THEN the system MUST accept the update and persist the new `observacion` value

#### Scenario: Other fields still blocked on a closed pasada
- GIVEN a pasada with `estado` = `completa` or `abortada`
- WHEN a `PUT` request attempts to update a field other than `observacion` (alone or together with `observacion`)
- THEN the system MUST reject the entire request with the existing closed-pasada error, and MUST NOT persist any field from that request, including `observacion`

### Requirement: Empty String and Null Semantics

For both `Pasada.observacion` and `LineaProduccion.observacion`, an empty string MUST be rejected by input validation (minimum length 1) and `null` MUST be accepted via `PUT` to clear an existing value.

#### Scenario: Reject empty string
- GIVEN a `PUT` request with `observacion: ""`
- WHEN the request is validated
- THEN the system MUST reject it with HTTP 400 Bad Request

#### Scenario: Clear observacion with null
- GIVEN a pasada or linea de producción with a non-null `observacion`
- WHEN a `PUT` request sends `observacion: null`
- THEN the system MUST persist `observacion` as `null`

### Requirement: LineaProduccion Observacion Set at Creation and via PUT

The system MUST allow `observacion` to be provided on `LineaProduccion` creation (`POST`) and MUST allow it to be updated via `PUT`, following the same permission as editing the rest of the entity — no new authorization rule is introduced.

#### Scenario: Create linea de producción with observacion
- GIVEN a valid `POST /api/lineas-produccion` payload including `observacion`
- WHEN the línea is created
- THEN the system MUST persist the línea with that `observacion` value

### Requirement: Pasada Observacion in Excel Report

The "Pasadas" sheet of the Excel report MUST include a new column with header `Observación`, positioned immediately after the `N° Pasada` column, populated from `Pasada.observacion` (or `-` when null). This column's key MUST be distinct from the existing `obs` key used for `observacionCierre`, and the existing `Observación Cierre` column MUST remain unchanged at its current position.

#### Scenario: Report includes both observacion columns distinctly
- GIVEN a pasada with `observacion` = `"nota inicio"` and `observacionCierre` = `"nota cierre"`
- WHEN the Excel report is generated
- THEN the "Pasadas" sheet MUST show `"nota inicio"` in the `Observación` column right after `N° Pasada`, and `"nota cierre"` unchanged in the `Observación Cierre` column at the end

### Requirement: LineaProduccion Observacion Excluded from Reports

`LineaProduccion.observacion` MUST NOT appear in any generated report (Excel or otherwise).

#### Scenario: Report generation does not touch linea observacion
- GIVEN a línea de producción with a non-null `observacion`
- WHEN any report is generated for that línea's pasadas
- THEN no worksheet or column MUST reference `LineaProduccion.observacion`
