## Exploration: Diseño e Implementación de las Entidades Core del Dominio

### Current State
Actualmente, el proyecto se encuentra en su fase inicial tras el Setup de Infraestructura (Fase 1). La carpeta `src/models` está vacía. El archivo de configuración de MikroORM (`mikro-orm.config.ts`) ya está preparado para buscar entidades TypeScript en `src/models/**/*.ts` y compiladas en `dist/models/**/*.js`. La configuración de TypeScript (`tsconfig.json`) tiene habilitado soporte experimental para decoradores (`experimentalDecorators: true`) y metadatos de reflexión (`emitDecoratorMetadata: true`), lo que simplifica enormemente el mapeo directo con decoradores de MikroORM.

El modelo de datos relacional versión 1.2 (`modelo_datos_control_pesaje.md`) especifica con detalle las tablas core del dominio, sus campos, tipos, restricciones y claves foráneas.

### Affected Areas
- `src/models/Usuario.ts` — Nueva entidad de dominio para la tabla `usuario`.
- `src/models/LineaProduccion.ts` — Nueva entidad de dominio para la tabla `linea_produccion`.
- `src/models/Articulo.ts` — Nueva entidad de dominio para la tabla `articulo`.
- `src/models/Marca.ts` — Nueva entidad de dominio para la tabla `marca`.
- `src/models/ArticuloMarca.ts` — Nueva entidad de dominio/pivote explícito para la relación N:M `articulo_marca`.
- `src/models/Etapa.ts` — Nueva entidad de dominio para la tabla `etapa`.
- `src/models/RutaPasadaEtapa.ts` — Nueva entidad de dominio para la tabla `ruta_pasada_etapa`.
- `src/models/index.ts` — Archivo de exportación de todas las entidades para facilitar su importación y configuración en MikroORM.
- `mikro-orm.config.ts` — Se mantendrá igual ya que utiliza un glob pattern (`src/models/**/*.ts`), pero se validará que detecte correctamente las nuevas entidades.

### Approaches

1. **Entity Decorators (Decoradores en clases TypeScript)** — Definir clases TypeScript en `src/models` y utilizar decoradores de MikroORM (`@Entity`, `@Property`, `@ManyToOne`, `@PrimaryKey`, etc.) directamente sobre ellas.
   - **Pros**:
     - Enfoque idiomático y estándar recomendado en TypeScript con MikroORM.
     - Co-locación de la definición del dominio y sus metadatos de persistencia en el mismo archivo.
     - Excelente soporte de auto-inferencia de tipos de MikroORM v7 (reduciendo código repetitivo).
     - Configuración directa compatible con las opciones de `tsconfig.json` del proyecto.
   - **Cons**:
     - Acopla las clases del dominio al framework ORM (MikroORM), lo cual se desvía de la pureza teórica de Arquitectura Hexagonal / DDD (Domain-Driven Design).
   - **Effort**: Low

2. **EntitySchema (Definiciones de esquema de MikroORM separadas)** — Definir clases puras de TypeScript (POJO/POCO sin decoradores) y mapear su persistencia usando el objeto `EntitySchema` de MikroORM en archivos separados o de configuración.
   - **Pros**:
     - Mantiene las clases de dominio 100% puras y desacopladas de cualquier infraestructura u ORM.
     - Permite cambiar de ORM en el futuro de forma trivial sin alterar el dominio.
   - **Cons**:
     - Duplicación de código sustancial (definición de la clase TS + definición del esquema de MikroORM).
     - Mayor complejidad para mantener ambos archivos en sincronía a medida que el modelo evoluciona.
     - Menor nivel de inferencia automática de relaciones de MikroORM v7, requiriendo tipado explícito complejo.
     - Poca documentación comunitaria en comparación con el enfoque de decoradores.
   - **Effort**: Medium-High

### Recommendation
Se recomienda enfáticamente utilizar **Approach 1 (Entity Decorators)**. 
Dadas las características del proyecto actual y la presencia activa de `experimentalDecorators: true` y `emitDecoratorMetadata: true` en `tsconfig.json`, este enfoque garantiza la máxima velocidad de desarrollo, menor cantidad de boilerplate, y el mejor soporte de herramientas y tipado fuerte propio de MikroORM v7. El desacoplamiento total que ofrece `EntitySchema` no justifica el sobrecosto de mantenimiento y boilerplate que introduce en esta fase del proyecto.

Además, para la relación N:M de `articulo_marca`, se recomienda modelar la tabla pivote de manera explícita con una clase `@Entity() ArticuloMarca` y relaciones `@ManyToOne` en lugar de un `@ManyToMany` implícito. Esto se debe a que la tabla física posee su propio autoincremental `id` como clave primaria en el modelo de datos relacional 1.2, lo cual MikroORM maneja de forma óptima mediante entidades asociativas explícitas.

### Risks

- **Precisión de Decimales en RutaPasadaEtapa**: Los campos `peso_ideal`, `peso_minimo` y `peso_maximo` están definidos como `DECIMAL(8,3)` en base de datos. En TypeScript, se representarán como `number`. Sin embargo, los drivers de PostgreSQL suelen retornar los tipos `numeric`/`decimal` como `string` para evitar pérdida de precisión de coma flotante en JS.
  - *Mitigación*: En MikroORM v7 se debe configurar `@Property({ columnType: 'decimal(8,3)' })` y se puede usar un custom converter o simplemente parsear a `number` al interactuar con el dominio si se requiere cálculos aritméticos directos.
- **Bajas Lógicas (`activo: boolean`)**: Las entidades `Usuario`, `LineaProduccion`, `Articulo`, `Marca` y `Etapa` cuentan con una columna `activo` con valor default `true` para baja lógica.
  - *Mitigación*: Se debe definir por defecto `activo: boolean = true` en las clases de entidad, y se podría evaluar en el futuro el uso de MikroORM Filter (`@Filter`) para ignorar automáticamente registros inactivos en las consultas globales.
- **Relaciones Cíclicas / Serialización**: Con múltiples relaciones bidireccionales (`Articulo` <-> `ArticuloMarca` <-> `Marca`), puede ocurrir recursividad infinita durante la serialización JSON de respuestas API si no se tiene cuidado.
  - *Mitigación*: Utilizar `wrap(entity).toJSON()` de MikroORM o configurar serializadores/DTOs específicos en la capa de controladores.

### Ready for Proposal
**Yes**. La especificación de entidades y relaciones core está clara y lista para ser propuesta e implementada en la siguiente fase utilizando el enfoque recomendado de decoradores MikroORM v7. El orquestador puede continuar al paso de propuesta.
