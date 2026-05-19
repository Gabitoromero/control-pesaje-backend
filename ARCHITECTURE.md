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

> [POR DEFINIR] — Completar antes de iniciar Fase I

| Capa | Tecnología | Notas |
|------|-----------|-------|
| Backend / API | — | — |
| Base de datos | — | — |
| Tiempo real | — | WebSockets / SSE |
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

## Modelo de datos (conceptual)

### Entidades principales

```
LineaProduccion
  - id
  - nombre
  - numero_balanza
  - activo

Articulo
  - id
  - nombre
  - descripcion
  - activo

Etapa
  - id
  - nombre
  - descripcion
  - activo

RutaPasada
  - id
  - articulo_id
  - activo

RutaPasadaEtapa  (artículo-etapa con parámetros)
  - id
  - ruta_pasada_id
  - etapa_id
  - orden
  - peso_ideal
  - peso_minimo
  - peso_maximo
  - cantidad_muestras_requeridas

Pasada
  - id
  - linea_produccion_id
  - articulo_id
  - numero (autoincremental por línea por día)
  - estado (en_curso | completa)
  - hora_inicio
  - hora_cierre

Muestra
  - id
  - pasada_id (nullable → control al azar)
  - etapa_id
  - linea_produccion_id
  - usuario_id
  - peso_neto
  - estado_validacion (ok | fuera_de_rango)
  - observacion
  - timestamp

Usuario
  - id
  - nombre
  - pin
  - rol (operario | jefe | visualizacion | administrador)
  - activo
```

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
