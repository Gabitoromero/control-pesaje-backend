# user-auth Specification

## Purpose
Secure the endpoints and implement secure JWT authentication with role-based access control (RBAC).

## Requirements

### Requirement: User Authentication Endpoint
The system MUST expose a login endpoint at `/api/auth/login` that receives a `username` and `password` payload.
- Inactive users (`activo = false`) MUST NOT be allowed to authenticate.
- Successful login MUST return a signed JWT token in `{ "success": true, "data": { "token": "..." } }`.
- User passwords MUST be hashed using bcrypt with at least 10 salt rounds.

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

---

## Scenarios

### Scenario: Successful User Login (Happy Path)
- GIVEN a user exists with valid credentials and `activo: true`
- WHEN a POST request is sent to `/api/auth/login` with correct username and password
- THEN the system MUST return 200 OK with `{ "success": true, "data": { "token": "<token_string>" } }`

### Scenario: Login with Invalid Password (Edge Case / Error)
- GIVEN a user exists with username `operador1`
- WHEN a POST request is sent to `/api/auth/login` with an incorrect password
- THEN the system MUST reject authentication and return 401 Unauthorized with `{ "success": false, "error": { "message": "Invalid credentials" } }`

### Scenario: Accessing Protected Endpoint with Expired JWT (Error State)
- GIVEN a GET request is sent to `/api/articulos`
- WHEN the request contains an expired JWT in the `Authorization` header
- THEN the `authenticateJWT` middleware MUST return 401 Unauthorized

### Scenario: Accessing Endpoint with Unauthorized Role (Edge Case / Error)
- GIVEN an authenticated user with role `operario`
- WHEN the user sends a POST request to `/api/usuarios` (admin-only)
- THEN the `requireRoles` guard MUST block the request and return 403 Forbidden
