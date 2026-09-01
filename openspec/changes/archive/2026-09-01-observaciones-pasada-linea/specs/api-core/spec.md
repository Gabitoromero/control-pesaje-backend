# Delta for api-core

## ADDED Requirements

### Requirement: Pasada and LineaProduccion Observacion Exposure

`GET`, `POST`, and `PUT` payloads for `/api/pasadas` and `/api/lineas-produccion` MUST include an `observacion` field: a nullable free-text note, distinct per entity, subject to Zod validation (non-empty string when provided, `null` allowed to clear).

#### Scenario: GET pasada list includes observacion
- GIVEN a persisted pasada with a non-null `observacion`
- WHEN a `GET` request is sent to `/api/pasadas`
- THEN each pasada object in the response array MUST include its `observacion` value

#### Scenario: GET pasada detail includes observacion
- GIVEN a persisted pasada with a non-null `observacion`
- WHEN a `GET` request is sent to `/api/pasadas/:id`
- THEN the response MUST include `observacion`

#### Scenario: GET lineas-produccion list and detail include observacion
- GIVEN a persisted `LineaProduccion` with a non-null `observacion`
- WHEN a `GET` request is sent to `/api/lineas-produccion` or `/api/lineas-produccion/:id`
- THEN the returned object(s) MUST include `observacion`, including via the `assignDevice` response shape

#### Scenario: PUT lineas-produccion updates observacion
- GIVEN an existing `LineaProduccion`
- WHEN a `PUT` request to `/api/lineas-produccion/:id` includes a new `observacion` value
- THEN the system MUST accept the request and the subsequent `GET` MUST reflect the updated value

#### Scenario: PUT pasada with invalid observacion is rejected
- GIVEN an existing pasada in any state
- WHEN a `PUT` request to `/api/pasadas/:id` sends `observacion: ""`
- THEN the system MUST reject the request with HTTP 400 Bad Request, per Zod validation
