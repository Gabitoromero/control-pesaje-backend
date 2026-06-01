# Roadmap

## Estado actual
`[x] Fase I — Setup de infraestructura`
`[x] Fase II — API Core`
`[ ] Fase III — Integración Raspberry Pi`
`[ ] Fase IV — Lógica de negocio avanzada (En progreso — Planificando 2FA)`

---

## Fases

### Fase I — Setup de infraestructura
**Estimado:** 35 horas  
**Estado:** ✅ Completado

- [x] Servidor configurado (VPS o local)
- [x] Base de datos inicializada (MikroORM & PostgreSQL)
- [x] Docker configurado
- [x] Seguridad base implementada (JWT Capa 1 y bcrypt)
- [x] Variables de entorno y configuración

---

### Fase II — API Core
**Estimado:** 60 horas  
**Estado:** ✅ Completado

- [x] CRUD de Usuarios (con roles y PIN)
- [x] CRUD de Artículos
- [x] CRUD de Etapas
- [x] CRUD de Líneas de producción
- [x] CRUD de Rutas de pasada (desacopladas y con parámetros por etapa en la ruta)
- [x] Lógica de Pasadas (inicio, listado, retomar, finalizar/abortar)
- [x] Registro de Muestras (trazabilidad y validaciones)
- [x] Validación de peso por parámetros de etapa en la ruta

---

### Fase III — Integración Raspberry Pi
**Estimado:** 50 horas  
**Estado:** ⬜ Pendiente

- [ ] Script de captura en Raspberry Pi
- [ ] Protocolo de envío al servidor
- [ ] Recepción en tiempo real en el servidor
- [ ] Descarte de datos en modo puesta a punto (sin sesión activa)

---

### Fase IV — Lógica de negocio avanzada
**Estimado:** 30 horas  
**Estado:** ⬜ Pendiente

- [ ] Control de sesiones concurrentes (1 sesión por operario)
- [ ] Lógica de pasadas simultáneas por línea
- [ ] Flujo de muestras fuera de rango (solicitar más muestras)
- [ ] Lógica de puesta a punto (detección por ausencia de sesión)
- [ ] Control al azar (sin pasada asociada)
- [ ] Baja lógica de todas las entidades

---

### Fase V — Dashboard Web
**Estimado:** 45 horas  
**Estado:** ⬜ Pendiente

- [ ] Interfaz de operario para tablet (captura y confirmación de muestras)
- [ ] Dashboard de monitoreo en tiempo real (jefe/gerente/visualización)
  - [ ] Estado por línea de producción
  - [ ] Pasadas en curso con avance por etapa
  - [ ] Promedios acumulados por etapa
  - [ ] Gráfico de muestras con líneas de referencia (ideal, mín, máx)
- [ ] Módulo de reportes (descarga Excel filtrado por fecha)
- [ ] ABM de entidades (administración)

---

### Fase VI — Testing y despliegue
**Estimado:** 30 horas  
**Estado:** ⬜ Pendiente

- [ ] Testing de integración
- [ ] Pruebas en planta con operarios reales
- [ ] Ajustes post-pruebas
- [ ] Despliegue en producción
- [ ] Documentación de uso para el cliente

---

## Fuera de alcance (no incluido)

- Operación offline
- Mantenimiento físico de hardware
- Integración con ERP u otros sistemas externos
- Soporte operativo continuo post-implementación
- Garantía ante fallas eléctricas o de red
