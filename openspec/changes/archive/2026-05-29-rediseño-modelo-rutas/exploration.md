## Exploration: Rediseño del Modelo de Rutas

### Current State
En el modelo actual, la secuencia de etapas y parámetros de pesaje está fuertemente acoplada a cada `Artículo` individual a través de la entidad `RutaPasadaEtapa` (que tiene una relación `@ManyToOne` directa con `Articulo`). Esto implica que si varios artículos comparten exactamente la misma secuencia de etapas y límites de peso, sus configuraciones deben duplicarse por completo para cada artículo en la base de datos.
Adicionalmente, `LineaProduccion` carece de un mecanismo para saber qué ruta se encuentra activa en el momento de registrar pesajes al azar (sin pasada activa), mientras que `Pasada` y `Muestra` referencian directamente al artículo en lugar de una entidad de ruta desacoplada.

### Affected Areas
- `src/models/RutaPasada.ts` — Nueva entidad que representará el template reutilizable de etapas de pesaje.
- `src/models/ArticuloRutaPasada.ts` — Nueva entidad intermedia explícita para la relación de muchos a muchos (N:M) entre `Articulo` y `RutaPasada`, con columna `activo: boolean` para baja lógica.
- `src/models/Articulo.ts` — Se incorporará la relación con la nueva entidad `RutaPasada` mediante la entidad intermedia explícita.
- `src/models/RutaPasadaEtapa.ts` — Se cambiará la relación `@ManyToOne` de `Articulo` a `RutaPasada`, y su restricción única `@Unique` pasará de `['articulo', 'etapa']` a `['rutaPasada', 'etapa']`.
- `src/models/LineaProduccion.ts` — Se agregará la propiedad `rutaPasadaActiva` (campo `ruta_pasada_activa_id`) que apunta opcionalmente a `RutaPasada` para poder validar muestras "al azar".
- `src/models/Pasada.ts` — Se añadirá una relación `@ManyToOne` a `RutaPasada` (`rutaPasada`) para rastrear qué ruta se está ejecutando físicamente.
- `src/models/Muestra.ts` — Se añadirá una relación `@ManyToOne` a `RutaPasada` (`rutaPasada`) para mantener trazabilidad exacta del proceso de pesaje al momento del registro.
- `src/models/index.ts` — Se exportarán las nuevas entidades `RutaPasada` y `ArticuloRutaPasada`.
- `src/models.test.ts` — Afectará el descubrimiento de entidades del ORM y requerirá adaptar los tests de persistencia y redondeo de decimales instanciando `RutaPasada`.
- `src/services/muestra.service.ts` — Modificará la validación en `registrarMuestra`: los límites de peso se obtendrán buscando la configuración `RutaPasadaEtapa` de la ruta activa (`rutaPasada.id`) asociada a la pasada en curso o a la línea de producción (si es al azar).
- `src/services/muestra.service.test.ts` — Afectará el seeding de pruebas al requerir sembrar `RutaPasada` en lugar de relacionar `Articulo` directamente a `RutaPasadaEtapa`.

### Approaches
1. **Relación N:M Explícita mediante Entidad Intermedia (`ArticuloRutaPasada`)** — Crear una clase de entidad explícita para modelar `articulo_ruta_pasada` con propiedades `@ManyToOne` hacia `Articulo` y `RutaPasada`, y una columna `activo: boolean` para la baja lógica.
   - Pros: Consistencia absoluta con el patrón de diseño actual de la base de datos (como `ArticuloMarca.ts`). Permite implementar la baja lógica (`activo: boolean`) requerida de manera no negociable por las reglas del negocio, y añadir metadatos en la relación en el futuro.
   - Cons: Requiere mantener una entidad TypeScript adicional.
   - Effort: Low

2. **Relación N:M Implícita con Decorador `@ManyToMany`** — Usar el decorador `@ManyToMany` de MikroORM con una tabla pivote declarativa sin crear una clase de entidad específica.
   - Pros: Ahorra código TypeScript boilerplate de la entidad intermedia.
   - Cons: Difícil soporte para baja lógica (`activo: boolean`) en la tabla intermedia, lo cual viola la **Lógica Crítica #2** del proyecto en `AGENTS.md` (prohibido usar DELETE físico).
   - Effort: Medium

### Recommendation
Se recomienda enfáticamente el **Enfoque 1 (Relación N:M Explícita mediante `ArticuloRutaPasada`)**. Este enfoque respeta de forma irrestricta la regla de **Baja Lógica (Regla No Negociable #2)** de `AGENTS.md` al permitir la propiedad `activo: boolean` en la tabla de relación. Además, mantiene una perfecta consistencia arquitectónica con la relación existente `ArticuloMarca.ts` y el modelo físico relacional del proyecto.

### Risks
- **Migración del Esquema y Datos**: El cambio de llave foránea en `RutaPasadaEtapa` (de `articulo_id` a `ruta_pasada_id`) romperá la compatibilidad con el esquema existente. Se requerirá un plan detallado de migración SQL para transferir los límites actuales a las nuevas rutas y asociar los artículos.
- **Validación de Pesajes al Azar**: Si una muestra se registra al azar (sin pasada vinculada), el sistema dependerá de que la línea de producción tenga configurada la `ruta_pasada_activa_id`. Si este campo es nulo, los pesajes al azar fallarán o se descartarán, por lo que el backend debe prever salvaguardas de validación.
- **Cascada de Errores en Tests de Integración**: Prácticamente todas las pruebas que sembraban límites directamente por artículo (`RutaPasadaEtapa`) fallarán en la compilación y ejecución, lo que requiere un refactor completo del seeding en los archivos `.test.ts`.

### Ready for Proposal
Yes — La exploración es sumamente sólida y detallada. Hemos comprendido todas las entidades actuales, los archivos afectados, los impactos en servicios y tests de integración, y definido el mejor camino técnico. El orquestador está listo para avanzar a la fase de propuesta de diseño detallada.
