# Control de Pesaje — Contexto para agentes IA y Desarrolladores

Este archivo sirve como punto de partida técnico rápido. Para evitar desactualizaciones, **no dupliques lógica de negocio ni del modelo de datos acá**. Consultá siempre los archivos de especificación correspondientes en la raíz.

---

## Archivos de contexto del proyecto

Toda la documentación y diseño del sistema se encuentra en la raíz del backend:
* **`OVERVIEW.md`** — Visión general y alcance del sistema.
* **`DICTIONARY.md`** — Glosario del dominio (términos como pasada, muestra, tara, puesta a punto).
* **`BUSINESS_RULES.md`** — Reglas de negocio obligatorias (**RN-01** a **RN-19**).
* **`FUNCTIONAL_REQUIREMENTS.md`** — Requerimientos funcionales detallados (**RF-01** a **RF-27**).
* **`ARCHITECTURE.md`** — Arquitectura del sistema, stack y modelo de datos conceptual.
* **`modelo_datos_control_pesaje.md`** — Diccionario de datos de la base de datos (11 entidades vigentes).
* **`ROADMAP.md`** — Fases del proyecto y estado actual de implementación.

---

## Convenciones de desarrollo

* **Idioma**: 
  * Estructura técnica y de infraestructura en **inglés** (controllers, services, middlewares, tests, etc.).
  * Nombres de entidades del dominio en **español** (ej. `Pasada`, `Muestra`, `RutaPasada`, `ArticuloRutaPasada`). Respetar siempre el glosario de `DICTIONARY.md`.
* **Stack**: Node.js v20+, TypeScript, Express 5, MikroORM (PostgreSQL), Zod (validación).
* **Baja Lógica**: Ninguna entidad se elimina físicamente de la base de datos. Se utiliza soft-delete (`activo: false`).

---

## Comandos comunes

Este proyecto utiliza `pnpm` como gestor de paquetes.

* **Ejecutar en desarrollo**: `pnpm dev`
* **Compilar el proyecto**: `pnpm build`
* **Ejecutar tests**: `pnpm test` (modo interactivo/watch) o `pnpm test run` (ejecución única)
* **Formatear código**: `pnpm format`
* **Ejecutar linter**: `pnpm lint`
