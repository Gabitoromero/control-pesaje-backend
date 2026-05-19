# Control de Pesaje — Contexto para agentes IA

Este archivo existe para que cualquier agente IA (Claude Code, Cursor, etc.) tenga contexto completo del proyecto antes de escribir código.

---

## ¿Qué es este sistema?

Sistema web de control de pesaje industrial para una planta de producción. Reemplaza registros manuales en papel por captura automática de pesos desde balanzas físicas via Raspberry Pi. Desarrollado por MaciaSoft.

**Leer antes de codear:**
- `docs/OVERVIEW.md` — visión general y alcance
- `docs/DICTIONARY.md` — glosario del dominio (términos como pasada, muestra, tara, puesta a punto)
- `docs/BUSINESS_RULES.md` — reglas de negocio (RN-01 a RN-17)
- `docs/FUNCTIONAL_REQUIREMENTS.md` — requerimientos funcionales (RF-01 a RF-27)
- `docs/ARCHITECTURE.md` — stack, modelo de datos y fases

---

## Lo más importante que tenés que saber

### Sobre el dominio
- Una **línea de producción** = una balanza = una Raspberry Pi
- Una **pasada** es la ejecución física de todos los controles de pesaje de un artículo. Pueden correr múltiples pasadas simultáneas en la misma línea.
- Una **muestra** es la medición individual de peso. Siempre llega como peso neto (la tara la configura el operario directo en la balanza, no se registra).
- La **puesta a punto** es cuando no hay sesión activa → el servidor descarta todo lo que llega de esa Raspberry.

### Sobre la lógica crítica
- El servidor es el **orquestador**: decide si los datos de una Raspberry se procesan o se descartan según el estado de sesión de la línea.
- Las muestras fuera de rango no cuentan para completar la etapa; se piden más hasta llegar a la cantidad requerida de muestras **aceptables**.
- Un operario no puede tener sesión activa en más de una tablet simultáneamente.
- **Ninguna entidad se elimina físicamente.** Siempre baja lógica (`activo: false`).

### Sobre los parámetros de pesaje
- Cada par `artículo-etapa` tiene sus propios `peso_ideal`, `peso_minimo`, `peso_maximo`.
- La tolerancia no es simétrica; mínimo y máximo se definen por separado.

---

## Convenciones de código

> [POR COMPLETAR] — agregar cuando se defina el stack tecnológico

- Idioma del código: `[POR DEFINIR]`
- Idioma de los nombres de dominio (entidades, variables): **español** (seguir el diccionario)
- Estilo: `[POR DEFINIR]`
- Tests: `[POR DEFINIR]`

---

## Lo que NO hay que implementar

- Modo offline
- Integración con ERP u otros sistemas externos
- Registro de tara (llega directo como peso neto)
- Eliminación física de entidades en base de datos
