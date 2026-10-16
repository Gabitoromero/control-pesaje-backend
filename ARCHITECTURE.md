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

**Evento `balanza-data` (Raspberry → Servidor):** payload `{ pesoNeto: number, unidad?: 'g' | 'kg' }`. El backend es el único punto de conversión a kg. Unidad efectiva = `unidad` de la trama (si viene y es válida) o, en su defecto, la `unidad` configurada del dispositivo. Un `unidad` inválido se rechaza con `error`. El dispositivo debe tener unidad configurada igualmente (fail-closed). Si ambas existen y difieren, se usa la de la trama y se emite un `console.warn` una sola vez por socket y por par (unidad de trama, unidad del dispositivo); un cambio de par (p. ej. tras una corrección de unidad en vivo) vuelve a avisar. Al tablet se retransmite solo `{ pesoNeto }` en kg.

### Reporte "No veo el peso" (tablet → Discord)

The tablet can ask the backend for a diagnostic report when the operator cannot see the weight. The periodic balanza flow monitor (silence alerts and its `BALANZA_SILENCE_ALERT_MS` / `BALANZA_ALERT_COOLDOWN_MS` settings) was removed; this on-demand report replaces it, and no alert is produced without a person pressing the button.

**Event `reportar-sin-peso` (tablet → backend, with ack):** payload v1 `{ v: 1, lineaId, ultimoPeso, ultimoPesoHaceMs, unidad, socketConectado, balanzaConectada, enSala, pantalla, clientTs }`. The ack `code` is one of `sent`, `cooldown` (with `retryAfterMs`), `no-linea`, `invalid-payload`, `forbidden` (device or unauthenticated socket) or `error`. `sent` means accepted, not delivered.

**Synchronous half** (`weight-issue-report.service.ts`, `submit()`): validates the payload and binds the report to `socket.data.lineaId`. The client `lineaId` is only cross-checked and a mismatch is written in the report. It then applies a 60 s in-memory cooldown per línea, shared by every tablet of that línea. The cooldown starts when the report is accepted, and a rejected request does not consume it. The ack is returned right away, after a snapshot of the evidence taken at press time: frame ring, paired device and session read with `SesionService.peekSesion()`, which has no side effects.

**Asynchronous half** (never throws into the socket; each section fails on its own):
1. In parallel: `diagnostico-solicitud { v: 1 }` to the paired RB with a 3 s timeout (skipped when no RB is paired; no operator data is ever sent to the RB), the operator lookup (`orm.em.fork()`, legajo and name; the report still goes out with the `usuarioId` if it fails) and the línea context (`linea-context.service.ts`).
2. Pure formatting (`weight-issue-report.formatter.ts`): a summary under 1900 characters plus a `.txt` attachment with all frames (backend ring and RB raw frames, 100 each) and RB logs.
3. Delivery (`weight-issue-report.delivery.ts`): up to 4 Discord attempts with fixed waits of 2, 5 and 10 s, no deadline and no `Retry-After` handling. Attempts 1-2 carry the attachment and attempts 3-4 send the summary only. Reports that overlap run independently. If every attempt fails, or `DISCORD_WEBHOOK_URL` is empty, the full summary is written to the backend log. The webhook URL is never logged.

The frame ring (`balanza-frame-ring.service.ts`) is fed by `balanza.handler.ts` for every accepted and discarded frame of a línea. All state (cooldown, ring) lives in memory and is cleared on restart.

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
