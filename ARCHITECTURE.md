# Arquitectura del Sistema

> ⚠️ Este documento debe actualizarse a medida que se tomen decisiones técnicas. Las secciones marcadas con `[POR DEFINIR]` requieren decisión antes de comenzar la fase correspondiente.

---

## Visión general

Sistema web con arquitectura cliente-servidor. El servidor actúa como **orquestador de contexto**: recibe datos de las Raspberry Pi, los valida contra el estado de sesión de cada línea, y los distribuye en tiempo real a los clientes conectados.

```
[Balanza KRETZ]
      |
[Raspberry Pi]  ──────►  [Servidor API]  ◄──────►  [Base de datos]
                               │
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
              [Tablet]   [Dashboard]  [Reportes]
            (operario)   (jefe/gerente)
```

---

## Stack tecnológico

| Capa | Tecnología | Notas |
|------|-----------|-------|
| Backend / API | Node.js con TypeScript | Patrón MVC |
| Base de datos | PostgreSQL | Acceso a datos mediante MikroORM |
| Tiempo real | WebSockets (Socket.io) | O SSE (a confirmar en implementación) |
| Frontend tablet | — | — |
| Dashboard web | — | — |
| Raspberry Pi | — | Script de captura y envío |
| Infraestructura | VPS o servidor local | A definir con cliente |
| Contenedores | Docker | Definido en propuesta |

---

## Comunicación en tiempo real

El sistema requiere comunicación bidireccional en tiempo real para:
1. Recibir el peso de la balanza en la tablet del operario (Raspberry → Servidor → Tablet)
2. Actualizar el dashboard de monitoreo (Servidor → Dashboard)

**Restricción importante:** Si no hay sesión activa de operario en una línea, el servidor descarta los datos que llegan de esa Raspberry. No se almacenan, no se procesan.

---

## Autenticación (capa única, contrato v1.5)

> Este sistema fue rediseñado en junio 2026 de dos capas (login global + PIN por línea) a una capa única. El diseño vigente vive en `../rediseno_auth_sesiones_v1_5.md` — no lo dupliques acá.

Login unificado con **legajo + PIN**, sin capa separada de "desbloqueo global". El diseño anterior de dos capas quedó preservado en la branch `archive/auth-two-layer` (no se elimina ni recibe commits nuevos), pero ya no refleja el sistema en producción.

---

## Modelo de datos (conceptual)

### Entidades principales

> El diccionario de datos vigente (contrato v1.5) vive en `../modelo_datos_control_pesaje_v1.5.md`. No lo dupliques acá: ese archivo nunca tuvo entidad `Marca` ni `ArticuloMarca` (esa relación N:M nunca se construyó — `Articulo` termina siendo la única tabla, con columna `nombre` propia), y `Usuario` usa `pin_hash`/`legajo` en vez de `password_hash`.

---

## Fases de desarrollo

| Fase | Contenido | Horas |
|------|-----------|-------|
| I | Setup infraestructura (Servidor, DB, Docker, seguridad base) | 35 hs |
| II | Desarrollo API Core (Pasadas, Etapas, Muestras, Usuarios) | 60 hs |
| III | Integración Raspberry y captura tiempo real | 50 hs |
| IV | Lógica de negocio avanzada (validaciones, contexto, sesiones, concurrencia) | 30 hs |
| V | Dashboard Web | 45 hs |
| VI | Testing, ajustes, despliegue en producción y pruebas en planta | 30 hs |
| **TOTAL** | | **250 hs** |

---

## Restricciones técnicas conocidas

- **Sin offline:** El sistema es 100% online. Ante una interrupción de red, los datos no se registran hasta restablecer la conectividad. Decisión tomada para mantener consistencia y simplificar arquitectura.
- **Balanzas KRETZ:** No envían pesos negativos. El peso que llega siempre es neto.
- **Tara:** No se registra ni se envía. El operario la configura directo en la balanza.
- **Una sesión por operario:** No puede haber sesión activa del mismo usuario en dos tablets simultáneamente.
- **Sin integración externa:** No hay integración con ERP ni sistemas de terceros.
