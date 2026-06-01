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

## Autenticación en Dos Capas (2FA)

Para balancear la seguridad de la administración técnica con la velocidad del operario en planta, el sistema implementa una autenticación de dos capas:

```
[Administrador / Jefe]                      [Operario de Planta]
          │                                           │
  (Capa 1: Login Global)                     (Capa 2: Sesión Planta)
  POST /api/auth/login                       POST /api/auth/activar-sesion-operario
  Contraseña robusta                         PIN (4-6 dígitos)
  JWT válido por 8 horas                     Expiración por inactividad (5 min)
          │                                           │
          ▼                                           ▼
[Tablet desbloqueada a nivel API]  ◄────────  [Sesión de pesaje activa en Línea]
```

### Flujo de Interacción
1. **Capa 1 (Desbloqueo Global):** El jefe/admin realiza login con contraseña robusta. Recibe un JWT con validez de 8 horas que autoriza a la tablet a comunicarse con la API de planta.
2. **Capa 2 (Sesión Operativa):** El operario de planta activa su sesión en una línea de producción enviando su PIN (4-6 dígitos) a `POST /api/auth/activar-sesion-operario` (con el JWT de Capa 1 en las cabeceras). El `SesionService` en memoria vincula la línea con el operario.
3. **Mantenimiento y Timeout:** Cada interacción de planta refresca el timestamp `operarioUltimaActividadAt`. Si transcurren **5 minutos** sin actividad, el backend pone la sesión del operario en `null` (modo puesta a punto, descarte de datos) sin invalidar el JWT global.
4. **Rate Limiting:** Tras **3 intentos fallidos** consecutivos de PIN en una línea, el backend bloquea las validaciones de PIN para esa línea durante **5 minutos** (HTTP 429).

---

## Modelo de datos (conceptual)

### Entidades principales

```
Usuario
  - id
  - nombre_apellido
  - nombre_usuario
  - password_hash
  - rol (operario | jefe | visualizacion | administrador)
  - activo

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

Marca
  - id
  - nombre
  - activo

ArticuloMarca (Intermedia N:M)
  - id
  - articulo_id
  - marca_id

RutaPasada
  - id
  - nombre
  - descripcion
  - activo

ArticuloRutaPasada (Intermedia N:M explícita)
  - id
  - articulo_id
  - ruta_pasada_id
  - activo

Etapa
  - id
  - nombre
  - descripcion
  - activo

RutaPasadaEtapa (Configuración de Etapa en Ruta)
  - id
  - ruta_pasada_id
  - etapa_id
  - orden
  - peso_ideal
  - peso_minimo
  - peso_maximo
  - cantidad_muestras_requeridas
  - activo

Pasada (Ejecución de Pesaje)
  - id
  - linea_produccion_id
  - ruta_pasada_id
  - articulo_id (opcional)
  - marca_id (opcional)
  - usuario_id
  - numero (autoincremental por línea por día)
  - estado (en_curso | completa | abortada)
  - motivo_cierre (opcional - justificación de aborto)
  - hora_inicio
  - hora_cierre
  - activo

Muestra (Medición de Peso)
  - id
  - pasada_id (opcional - NULL en muestras al azar)
  - usuario_id
  - articulo_id
  - etapa_id
  - linea_produccion_id
  - peso_neto
  - estado_validacion (ok | fuera_de_rango)
  - observacion
  - timestamp
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
