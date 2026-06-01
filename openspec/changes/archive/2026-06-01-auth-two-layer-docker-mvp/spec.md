# Specifications: Autenticación en Dos Capas & Docker MVP

Este documento define la especificación técnica de la API y el comportamiento del contenedor Docker para el MVP de la Autenticación en Dos Capas.

---

## Especificación de Endpoints (Capa 1 & Capa 2)

### 1. Login Global (Capa 1)
*   **Endpoint:** `POST /api/auth/login`
*   **Auth:** Ninguna (Pública)
*   **Request Body (Zod: `LoginSchema`):**
    ```typescript
    {
      nombreUsuario: string; // Requerido, no vacío
      contrasena: string;    // Requerido, no vacío
    }
    ```
*   **Respuestas:**
    *   **`200 OK` (Autenticación Exitosa):**
        ```json
        {
          "success": true,
          "data": {
            "token": "eyJhbGciOi..."
          }
        }
        ```
    *   **`401 Unauthorized` (Credenciales incorrectas o usuario inactivo):**
        ```json
        {
          "success": false,
          "error": {
            "message": "Invalid credentials or inactive user"
          }
        }
        ```
    *   **`400 Bad Request` (Error de validación del body):**
        ```json
        {
          "success": false,
          "error": {
            "message": "Validation failed",
            "details": [ { "path": "nombreUsuario", "message": "Required" } ]
          }
        }
        ```

### 2. Activación de Sesión Operativa (Capa 2)
*   **Endpoint:** `POST /api/auth/activar-sesion-operario`
*   **Auth:** JWT Requerido (`Authorization: Bearer <JWT_Capa1>`)
*   **Request Body (Zod: `ActivarSesionSchema`):**
    ```typescript
    {
      pin: string;               // PIN de 4 a 6 dígitos (numérico)
      lineaProduccionId: number; // ID de la línea de producción donde se activa
    }
    ```
*   **Respuestas:**
    *   **`200 OK` (Sesión Operativa Activada):**
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
    *   **`401 Unauthorized` (JWT Capa 1 faltante o inválido):**
        ```json
        {
          "success": false,
          "error": { "message": "Invalid or expired token" }
        }
        ```
    *   **`400 Bad Request` (PIN con formato inválido o campos faltantes):**
        ```json
        {
          "success": false,
          "error": { "message": "PIN must be between 4 and 6 digits" }
        }
        ```
    *   **`404 Not Found` (Usuario operario no existe para ese PIN o la línea no existe):**
        ```json
        {
          "success": false,
          "error": { "message": "No active user found with the provided PIN" }
        }
        ```
    *   **`409 Conflict` (El operario ya tiene una sesión activa en otra línea):**
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
        *Nota:* El cliente debe ofrecer al usuario dos opciones: (A) llamar a `POST /api/auth/cerrar-sesion-operario` para la `lineaProduccionId` del conflicto y reintentar, o (B) cancelar y mantener la sesión original.
    *   **`429 Too Many Requests` (Límite de intentos de PIN alcanzado - Rate Limiting):**
        ```json
        {
          "success": false,
          "error": { "message": "Too many consecutive failed attempts. Blocked for 5 minutes." }
        }
        ```

### 3. Cierre de Sesión Operario (Capa 2)
*   **Endpoint:** `POST /api/auth/cerrar-sesion-operario`
*   **Auth:** JWT Requerido (`Authorization: Bearer <JWT_Capa1>`)
*   **Request Body (Zod: `CerrarSesionOperarioSchema`):**
    ```typescript
    {
      lineaProduccionId: number;
    }
    ```
*   **Respuestas:**
    *   **`200 OK` (Cierre Exitoso):**
        ```json
        {
          "success": true,
          "data": {
            "message": "Operator session closed successfully"
          }
        }
        ```
    *   **`400 Bad Request` (La línea no tiene una sesión activa):**
        ```json
        {
          "success": false,
          "error": { "message": "No active session found for this line" }
        }
        ```

### 4. Obtener Estado de Sesión Activa
*   **Endpoint:** `GET /api/auth/sesion-activa/:lineaId`
*   **Auth:** JWT Requerido (`Authorization: Bearer <JWT_Capa1>`)
*   **Respuestas:**
    *   **`200 OK` (Retorna la sesión o null si está en puesta a punto):**
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
        *Nota:* Si el operario ha expirado por timeout de 5 minutos, `usuarioIdOperario` será `null` y `operarioUltimaActividadAt` será `null`, pero se mantendrá el token global de Capa 1 en memoria. El artículo pertenece a la `Pasada`, no a la sesión.

---

## Especificación del Contenedor Docker (MVP Oficina)

*   **Dockerfile**:
    *   Debe construirse usando una imagen base oficial de Node.js v20-alpine.
    *   Debe constar de una construcción multi-stage para compilar código TypeScript a producción y minimizar el tamaño del contenedor.
    *   Debe instalar dependencias únicamente de producción en la fase final (`pnpm install --prod`).
*   **Docker Compose**:
    *   Debe levantar un servicio `postgres` (PostgreSQL 15) en el puerto `5433` mapeado internamente.
    *   Debe levantar un servicio `backend` que dependa de `postgres` mediante un healthcheck de Postgres, asegurando que la base de datos esté lista para aceptar conexiones antes de iniciar el servidor Node.
    *   Debe compartir una red de docker (`bridge`) para comunicación interna segura, usando `postgres` como host en lugar de `localhost`.
