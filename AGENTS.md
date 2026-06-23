# `agents.md` — Contexto de Desarrollo

Este archivo es la fuente de verdad para el desarrollo del backend de **Control de Pesaje**. Define la arquitectura, convenciones y lógica crítica que todo agente debe respetar.

## 1. Stack & Arquitectura
- **Lenguaje:** Node.js con TypeScript.
- **Base de Datos:** PostgreSQL.
- **ORM:** MikroORM.
- **Patrón:** MVC (Model-View-Controller).
  - **Models:** Entidades de MikroORM y acceso a datos.
  - **Controllers:** Orquestación de la lógica de negocio y respuesta HTTP.
  - **Views:** En este backend, las "Views" se refieren a los DTOs de respuesta JSON.
- **Tiempo Real:** WebSockets (Socket.io) o SSE para la comunicación bidireccional con Raspberry Pi y Tablets.

## 2. Convención de Idiomas (Regla de Oro)
- **Infraestructura y Código Técnico:** Inglés (ej: `controller`, `service`, `request`, `error`, `interface`, `middleware`).
- **Dominio y Entidades:** Español (ej: `Pasada`, `Muestra`, `Articulo`, `Etapa`, `LineaProduccion`).
  - *Ejemplo:* `getPasadaById(id: string)`, `interface MuestraDTO`.
  - **Fuente de verdad:** Seguir estrictamente el `DICTIONARY.md`.

## 3. Lógica Crítica del Negocio (No negociable)
1. **Orquestador de Contexto:** El servidor decide si procesa o descarta un peso. Si la `LineaProduccion` no tiene una sesión de `Usuario` activa, el dato de la Raspberry se **descarta**.
2. **Baja Lógica:** Está terminantemente prohibido usar `DELETE` físico. Todas las entidades deben usar baja lógica (ej. propiedad `activo: boolean`). **Excepción explícita y única:** `Muestra` usa borrado físico (`hardDelete`) por decisión de producto — las muestras no requieren trazabilidad histórica una vez eliminadas y no tienen entidades hijas dependientes.
3. **Validación de Muestras:** Una muestra `fuera_de_rango` se registra por trazabilidad pero **no suma** para completar la cantidad de muestras requeridas de una etapa (definida en `RutaPasadaEtapa`).
4. **Propiedad de Pasadas:** Un usuario con sesión activa solo registra muestras de pasadas iniciadas por él mismo. No se permite la adición de muestras sobre pasadas de otros usuarios.
5. **Sin Estado Offline:** No implementar lógica de sincronización compleja; si la conexión falla, el sistema no opera.

## 4. Estructura de Carpetas Sugerida
```text
src/
├── config/          # Environment vars, database connection
├── controllers/     # HTTP/Socket handlers
├── models/          # Entity definitions (MikroORM)
├── services/        # Business logic (logic that doesn't fit in controller)
├── middlewares/     # Auth, validation, logging
├── utils/           # Helpers & English utility functions
└── routes/          # API route definitions
```

## 5. Instrucciones de Implementación
- **Tipado:** Usar Interfaces o Types para todas las entidades del dominio. Evitar el uso de `any`.
- **Validaciones:** Usar librerías como `zod` o `joi` para validar el `body` de los requests antes de que lleguen al controlador.
- **Trazabilidad:** Cada vez que se cree una `Muestra`, asegurar que el `usuario_id` y el `timestamp` sean precisos.
