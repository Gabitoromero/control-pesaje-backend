# session-orchestration Specification

## Purpose
Orchestrate in-memory active operator tablet sessions for each line and validate real-time weight packets.

## Requirements

### Requirement: In-Memory Session Registry
- The system MUST maintain a thread-safe, in-memory registry mapping `linea_produccion_id` to an active session context.
- The active session context MUST contain `usuario_id`, `linea_produccion_id`, and the client WebSocket/tablet connection identifier.

### Requirement: Single Active Session Constraint
- An operator (`usuario_id`) MUST NOT have more than one active session at any given time across all lines.
- If an operator attempts to open a session on line B while having an active session on line A, the system MUST terminate the session on line A before opening the session on line B.

### Requirement: Puesta a Punto (Setup Mode) Weight Discarding
- If a production line does not have an active session, the system MUST assume the line is in `puesta_a_punto` (setup mode).
- Any weight packet received from a Raspberry Pi/scale associated with a line without an active session MUST be immediately discarded by the server.
- The server MUST NOT persist discarded weights to the database.

### Requirement: Connection Failures & No Offline State
- If the websocket or network connection fails, the system MUST immediately stop processing.
- The system MUST NOT support offline synchronization of weights.

## Scenarios

### Scenario: Opening an Active Tablet Session
- GIVEN a valid user with role `operario`
- WHEN the user logins and starts a session on `Linea 1`
- THEN the system MUST register the session in memory and map `Linea 1` to `usuario_id`

### Scenario: Single Session Enforcement
- GIVEN user `operador1` is active on `Linea 1`
- WHEN `operador1` logs in and starts a session on `Linea 2`
- THEN the system MUST terminate the session on `Linea 1` and establish the session on `Linea 2`

### Scenario: Discarding Weight in Puesta a Punto
- GIVEN `Linea 1` has no active operario session (setup mode)
- WHEN a weight check is received from the Raspberry Pi on `Linea 1`
- THEN the system MUST immediately discard the weight and return HTTP 400 or ignore it without saving to the database

### Scenario: Accept Weight in Active Session
- GIVEN `Linea 1` has an active operario session
- WHEN a weight check is received from the Raspberry Pi on `Linea 1`
- THEN the system MUST accept the weight and proceed with range validation and persistence

### Scenario: Connection Loss Halts Operation
- GIVEN a network connection failure between the Raspberry Pi and the backend
- WHEN weights are weighed on the scale
- THEN the system MUST NOT record or buffer them, and weight registration MUST fail
