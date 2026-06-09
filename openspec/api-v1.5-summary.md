# Resumen de API de Autenticación y Sesiones v1.5 (Backend)

Este documento describe el estado final de los endpoints de autenticación y manejo de sesiones del backend tras el rediseño a la arquitectura de "Doble Capa". Esto servirá de guía para la integración en el Frontend.

## Endpoints Principales

### 1. `POST /api/auth/login`
- **¿Para qué sirve?** Genera el JWT Global (Capa 1). Valida que el legajo y el PIN sean correctos. Reemplaza el viejo login por contraseña.
- **Payload esperado:** `{ "legajo": "LEG-1", "pin": "1234" }`
- **Respuesta Exitosa (200 OK):** `{ "success": true, "data": { "token": "ey...", "user": { ... } } }`
- **Errores:** `401 Unauthorized` (Credenciales inválidas), `429 Too Many Requests` (Legajo bloqueado temporalmente por múltiples intentos fallidos).

### 2. `POST /api/auth/sesion-linea`
- **¿Para qué sirve?** Abre una sesión operativa en una tablet/línea (Capa 2). Evita el "Don de la ubicuidad" validando que el operario no esté logueado en otra línea. Requiere JWT válido. Reemplaza a los viejos endpoints `/activar-sesion` y `/verificar-pin`.
- **Headers:** `Authorization: Bearer <JWT>`
- **Payload esperado:** `{ "lineaProduccionId": 1 }`
- **Respuesta Exitosa (201 Created):** `{ "success": true, "data": { "lineaProduccionId": 1, "usuarioId": 5, "usuarioRol": "operario", "ultimaActividadAt": "..." } }`
- **Errores:** `401 Unauthorized` (Falta JWT), `403 Forbidden` (Rol visualización no permitido), `409 Conflict` (El usuario ya tiene una sesión abierta en OTRA línea).

### 3. `PATCH /api/auth/actividad`
- **¿Para qué sirve?** Resetea el contador de inactividad de 5 minutos en el backend para la sesión de una línea. Debe llamarse periódicamente desde el front mientras el operario esté tocando la tablet.
- **Headers:** `Authorization: Bearer <JWT>`
- **Payload esperado:** `{ "lineaProduccionId": 1 }`
- **Respuesta Exitosa (200 OK):** `{ "success": true, "data": { "ultimaActividadAt": "..." } }`
- **Errores:** `404 Not Found` (No hay sesión activa para actualizar).

### 4. `GET /api/auth/sesion-activa/:lineaId`
- **¿Para qué sirve?** Consulta quién está logueado *actualmente* en una línea específica. Importante: llamar a este endpoint ejecuta el chequeo perezoso de inactividad de 5 minutos (si expiró, limpia la sesión silenciosamente y devuelve la sesión vacía).
- **Headers:** `Authorization: Bearer <JWT>`
- **Respuesta Exitosa (200 OK):** `{ "success": true, "data": { "usuarioId": 5, "usuarioRol": "operario", ... } }` (Si no hay nadie o la sesión expiró por inactividad, `usuarioId` y `usuarioRol` vendrán nulos).

### 5. `POST /api/auth/cerrar-sesion`
- **¿Para qué sirve?** Cierra exclusivamente la sesión local de la línea (Capa 2). **No invalida el JWT Global**. 
- **Headers:** `Authorization: Bearer <JWT>`
- **Payload esperado:** `{ "lineaProduccionId": 1 }`
- **Respuesta Exitosa (200 OK):** `{ "success": true, "data": { "message": "Sesion cerrada exitosamente" } }`

---

## Cambios Clave para el Frontend

1. **JWT Global Independiente:** El vencimiento de inactividad (5 min) en la tablet **NO DEBE** borrar el JWT. El JWT global dura 12 horas y permite seguir navegando como lectura o redirigirse al login de PIN local sin quemar toda la aplicación.
2. **Manejo de Inactividad (401/Lazy Expiry):** Si el backend detecta inactividad en una petición protegida a la línea, invalidará la sesión local. El interceptor de Axios en el Frontend **NO DEBE** borrar el token ni redirigir a `/login` si es un error de Capa 2. Debe redirigir a la pantalla local de `/pin` (`ActivarSesionPage`) para que reingrese el PIN.
3. **Endopints Obsoletos Eliminados:** Ya no existen `/verificar-pin` ni `/activar-sesion`. Todo fue unificado en `/sesion-linea`.
