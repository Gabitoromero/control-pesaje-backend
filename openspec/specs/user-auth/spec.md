# user-auth Specification

## Purpose
Secure the endpoints, implement secure JWT authentication with role-based access control (RBAC), and define the two-layer authentication mechanism (Global Login + Operational Session) alongside the Docker containerization MVP requirements.

## Requirements

### Requirement: User Authentication Endpoint (Capa 1 - Login Global)
The system MUST expose a global login endpoint at `/api/auth/login` that receives a `nombreUsuario` and `contrasena` payload.
- Inactive users (`activo = false`) MUST NOT be allowed to authenticate.
- Successful login MUST return a signed JWT token (Capa 1) in `{ "success": true, "data": { "token": "..." } }`.
- User passwords MUST be hashed using bcrypt with at least 10 salt rounds.
- **Request Body (Zod: `LoginSchema`):**
  ```typescript
  {
    nombreUsuario: string; // Requerido, no vacío
    contrasena: string;    // Requerido, no vacío
  }
  ```
- **Responses:**
  - **`200 OK` (Autenticación Exitosa):** `{ "success": true, "data": { "token": "eyJhbGciOi..." } }`
  - **`401 Unauthorized` (Credenciales incorrectas o usuario inactivo):** `{ "success": false, "error": { "message": "Invalid credentials or inactive user" } }`
  - **`400 Bad Request` (Error de validación del body):** `{ "success": false, "error": { "message": "Validation failed", "details": [...] } }`

### Requirement: Activación de Sesión Operativa (Capa 2)
The system MUST allow activating an operational session for an operator user at a specific production line.
- **Endpoint:** `POST /api/auth/activar-sesion-operario`
- **Auth:** JWT Required (`Authorization: Bearer <JWT_Capa1>`)
- **Request Body (Zod: `ActivarSesionSchema`):**
  ```typescript
  {
    pin: string;               // PIN de 4 a 6 dígitos (numérico)
    lineaProduccionId: number; // ID de la línea de producción donde se activa
  }
  ```
- **Responses:**
  - **`200 OK` (Sesión Operativa Activada):**
    ```json
    {
      "success": true,
      "data": {
        "lineaProduccionId": 1,
        "usuarioIdGlobal": 2,
        "usuarioIdOperario": 5,
        "pasadaId": null,
        "connectedAt": "2026-06-01T11:45:00Z",
        "operarioUltimaActividadAt": "2026-06-01T11:45:00Z"
      }
    }
    ```
  - **`401 Unauthorized` (JWT Capa 1 faltante o inválido):** `{ "success": false, "error": { "message": "Invalid or expired token" } }`
  - **`400 Bad Request` (PIN con formato inválido o campos faltantes):** `{ "success": false, "error": { "message": "PIN must be between 4 and 6 digits" } }`
  - **`404 Not Found` (Usuario operario no existe para ese PIN o la línea no existe):** `{ "success": false, "error": { "message": "No active user found with the provided PIN" } }`
  - **`409 Conflict` (El operario ya tiene una sesión activa en otra línea):**
    ```json
    {
      "success": false,
      "error": {
        "code": "OPERATOR_SESSION_CONFLICT",
        "message": "Operator already has an active session on another line",
        "data": { "lineaProduccionId": 1 }
      }
    }
    ```
  - **`429 Too Many Requests` (Límite de intentos de PIN alcanzado - Rate Limiting):** `{ "success": false, "error": { "message": "Too many consecutive failed attempts. Blocked for 5 minutes." } }`

### Requirement: Cierre de Sesión Operario (Capa 2)
The system MUST allow closing an active operator session at a production line.
- **Endpoint:** `POST /api/auth/cerrar-sesion-operario`
- **Auth:** JWT Required (`Authorization: Bearer <JWT_Capa1>`)
- **Request Body (Zod: `CerrarSesionOperarioSchema`):**
  ```typescript
  {
    lineaProduccionId: number;
  }
  ```
- **Responses:**
  - **`200 OK` (Cierre Exitoso):** `{ "success": true, "data": { "message": "Operator session closed successfully" } }`
  - **`400 Bad Request` (La línea no tiene una sesión activa):** `{ "success": false, "error": { "message": "No active session found for this line" } }`

### Requirement: Obtener Estado de Sesión Activa
The system MUST allow retrieving the active operator session state for a given production line.
- **Endpoint:** `GET /api/auth/sesion-activa/:lineaId`
- **Auth:** JWT Required (`Authorization: Bearer <JWT_Capa1>`)
- **Responses:**
  - **`200 OK` (Retorna la sesión o null si está en puesta a punto):**
    ```json
    {
      "success": true,
      "data": {
        "lineaProduccionId": 1,
        "usuarioIdGlobal": 2,
        "usuarioIdOperario": 5,
        "pasadaId": null,
        "connectedAt": "2026-06-01T11:45:00Z",
        "operarioUltimaActividadAt": "2026-06-01T11:45:00Z"
      }
    }
    ```
    *Nota:* Si el operario ha expirado por timeout de 5 minutos, `usuarioIdOperario` será `null` y `operarioUltimaActividadAt` será `null`, pero se mantendrá el token global de Capa 1 en memoria.

### Requirement: JWT Verification Middleware
The `authenticateJWT` middleware MUST verify JSON Web Tokens in the `Authorization: Bearer <token>` header.
- The JWT payload MUST include the following claims: `id` (userId), `username`, and `rol`.
- If the token is expired, invalid, or missing, the system MUST return HTTP 401 Unauthorized.

### Requirement: Role Guard Authorization
The `requireRoles` guard MUST validate that the authenticated user possesses an authorized role. The roles allowed in the system are: `operario`, `jefe`, `visualizacion`, and `administrador`.

| Protected Endpoint | Allowed Roles |
|---------------------|---------------|
| `/api/usuarios` (Write) | `administrador` |
| `/api/articulos`, `/api/etapas` (Write) | `administrador`, `jefe` |
| `/api/lineas-produccion`, `/api/rutas-pasadas-etapas` (Write) | `administrador`, `jefe` |
| Core Endpoint (Read/GET) | `administrador`, `jefe`, `operario`, `visualizacion` |

Unauthorized role access attempts MUST return HTTP 403 Forbidden.

### Requirement: Especificación del Contenedor Docker (MVP Oficina)
The development and execution environment MUST be containerized for reproducible office execution.
- **Dockerfile**:
  - MUST build using the official base Node.js v20-alpine image.
  - MUST implement a multi-stage build to compile TypeScript and reduce final image size.
  - MUST install only production dependencies in the final run stage (`pnpm install --prod`).
- **Docker Compose**:
  - MUST define a `postgres` database service running PostgreSQL 15 and mapping port `5433` externally.
  - MUST define a `backend` application service that depends on `postgres` through a reliable healthcheck, ensuring database readiness before launching the Express server.
  - MUST share a common secure `bridge` network, communicating with database using the `postgres` host.

---

## Scenarios

### Scenario: Successful User Login (Happy Path)
- GIVEN a user exists with valid credentials and `activo: true`
- WHEN a POST request is sent to `/api/auth/login` with correct `nombreUsuario` and `contrasena`
- THEN the system MUST return 200 OK with `{ "success": true, "data": { "token": "<token_string>" } }`

### Scenario: Login with Invalid Password (Edge Case / Error)
- GIVEN a user exists with username `operador1`
- WHEN a POST request is sent to `/api/auth/login` with an incorrect password
- THEN the system MUST reject authentication and return 401 Unauthorized with `{ "success": false, "error": { "message": "Invalid credentials or inactive user" } }`

### Scenario: Accessing Protected Endpoint with Expired JWT (Error State)
- GIVEN a GET request is sent to `/api/articulos`
- WHEN the request contains an expired JWT in the `Authorization` header
- THEN the `authenticateJWT` middleware MUST return 401 Unauthorized

### Scenario: Accessing Endpoint with Unauthorized Role (Edge Case / Error)
- GIVEN an authenticated user with role `operario`
- WHEN the user sends a POST request to `/api/usuarios` (admin-only)
- THEN the `requireRoles` guard MUST block the request and return 403 Forbidden
