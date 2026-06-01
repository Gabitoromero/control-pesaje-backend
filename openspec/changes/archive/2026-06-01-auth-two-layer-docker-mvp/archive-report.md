# Reporte de Archivado: Autenticación en Dos Capas & Docker MVP

**Cambio**: `auth-two-layer-docker-mvp`
**Fecha de Finalización**: 2026-06-01
**Estado de Verificación**: 🟢 PASS
**Ruta del Histórico**: `openspec/changes/archive/2026-06-01-auth-two-layer-docker-mvp/`
**Modo de Almacén**: `hybrid`

---

## 1. Resumen de la Implementación
El cambio `auth-two-layer-docker-mvp` ha culminado de forma impecable, estableciendo las bases del sistema de control y seguridad de accesos del backend en dos niveles clave:
1. **Capa 1 (Login Global con JWT)**: Endpoint de login global en `/api/auth/login` con validaciones Zod robustas, encriptación segura mediante `bcrypt`, y la validación de estado activo del usuario.
2. **Capa 2 (Sesión Operativa de Planta con PIN)**: Mecanismo de alta seguridad para habilitar operarios en líneas de producción específicas (`/api/auth/activar-sesion-operario`), con protección integrada de Rate Limiting por intentos fallidos de PIN (bloqueo de 5 min al 3er fallo) y control de inactividad de 5 minutos.
3. **RF-17 (Exclusividad de Operario)**: Se garantiza que un operario no mantenga sesiones simultáneas activas en diferentes líneas de producción, devolviendo código `OPERATOR_SESSION_CONFLICT` en caso de intento de doble sesión.
4. **Simplificación de la Sesión en Memoria**: Eliminación del campo `articuloId` de la sesión activa (`ActiveSession`), trasladándolo correctamente al contexto dinámico de la `Pasada` para respetar los principios de arquitectura limpia.
5. **Dockerización Completa**: Preparación de un entorno autocontenido para pruebas de simulación en la oficina del cliente, compuesto por un `Dockerfile` multi-stage altamente optimizado (Node.js v20-alpine con `pnpm`) y un `docker-compose.yaml` interconectado con PostgreSQL 15 y dependencias de salud y red `bridge`.

---

## 2. Consolidación de Especificaciones (Source of Truth)
Las especificaciones locales del cambio han sido integradas de manera exitosa en el archivo de especificaciones maestro de seguridad de la aplicación:
*   **Especificación Principal Actualizada**: [openspec/specs/user-auth/spec.md](file:///home/gtr/work/maciasoft/Controlador%20Pesaje/codigo/backend/openspec/specs/user-auth/spec.md)
    *   **Login Global (Capa 1)**: Añadidos Zod schemas, payloads y códigos de respuesta.
    *   **Activación de Sesión (Capa 2)**: Requisitos, payload de PIN, y códigos HTTP (200, 401, 400, 404, 409 Conflict, 429 Rate Limited).
    *   **Cierre de Sesión (Capa 2)**: Endpoint manual de desconexión.
    *   **Estado de Sesión Activa**: GET con timeout automático de inactividad de 5 minutos.
    *   **Especificación Docker (MVP Oficina)**: Requerimientos de contenedor y composición del stack.

---

## 3. Listado de Archivos Consolidados e Historial
El directorio de cambio `openspec/changes/auth-two-layer-docker-mvp/` ha sido trasladado por completo al archivo histórico con el prefijo de fecha correspondiente:

*   📁 **Ruta de Origen**: `openspec/changes/auth-two-layer-docker-mvp/` (Removido tras el traslado)
*   📁 **Ruta de Destino**: [openspec/changes/archive/2026-06-01-auth-two-layer-docker-mvp/](file:///home/gtr/work/maciasoft/Controlador%20Pesaje/codigo/backend/openspec/changes/archive/2026-06-01-auth-two-layer-docker-mvp/)

### Inventario de Archivos Históricos:
1.  **[proposal.md](file:///home/gtr/work/maciasoft/Controlador%20Pesaje/codigo/backend/openspec/changes/archive/2026-06-01-auth-two-layer-docker-mvp/proposal.md)**: Intención inicial del cambio, alcance (In/Out of Scope) y mitigación de riesgos de base de datos en Docker.
2.  **[spec.md](file:///home/gtr/work/maciasoft/Controlador%20Pesaje/codigo/backend/openspec/changes/archive/2026-06-01-auth-two-layer-docker-mvp/spec.md)**: Especificaciones técnicas completas de endpoints API, comportamiento del JWT/PIN y los requisitos de Docker.
3.  **[design.md](file:///home/gtr/work/maciasoft/Controlador%20Pesaje/codigo/backend/openspec/changes/archive/2026-06-01-auth-two-layer-docker-mvp/design.md)**: Diseño arquitectónico, diagrama de secuencia de autenticación de dos capas, remoción de `articuloId` de la sesión en memoria, e implementación de Rate Limiting.
4.  **[tasks.md](file:///home/gtr/work/maciasoft/Controlador%20Pesaje/codigo/backend/openspec/changes/archive/2026-06-01-auth-two-layer-docker-mvp/tasks.md)**: Planificación y desglose de tareas técnicas detalladas.
5.  **[apply-progress.md](file:///home/gtr/work/maciasoft/Controlador%20Pesaje/codigo/backend/openspec/changes/archive/2026-06-01-auth-two-layer-docker-mvp/apply-progress.md)**: Registro exhaustivo de la implementación paso a paso de las tareas.
6.  **[verify-report.md](file:///home/gtr/work/maciasoft/Controlador%20Pesaje/codigo/backend/openspec/changes/archive/2026-06-01-auth-two-layer-docker-mvp/verify-report.md)**: Reporte de verificación completo donde se registra compilación exitosa (`tsc`) y aprobación del total de pruebas unitarias e integración en verde absoluto (`65/65 tests passed`).

---

## 4. Estado de Verificación y Calidad
*   **Pruebas Ejecutadas**: `65 passed / 0 failed` en Vitest.
*   **Resultados Clave de Trazabilidad**:
    *   `src/api.test.ts` y `src/services/sesion.service.test.ts` validados al 100%.
    *   Cumplimiento absoluto de la restricción del operario en múltiples líneas (RF-17).
    *   Trazabilidad completa con logs y respuestas explícitas en cada nivel.

Este hito representa la maduración estructural del backend y prepara el camino para la integración física con las Raspberry Pi 5 y las balanzas una vez se disponga del equipamiento.
