# Tasks: Rediseño del Modelo de Rutas

## Review Workload Forecast

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

| Field | Value |
|-------|-------|
| Estimated changed lines | 380 - 460 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: Schema Foundation (Infrastructure) → PR 2: Business Logic & Tests |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

### Suggested Work Units
| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Core database entities and schema | PR 1 | RutaPasada, ArticuloRutaPasada, Articulo, RutaPasadaEtapa |
| 2 | Service logic, remaining models, and integration tests | PR 2 | LineaProduccion, Pasada, Muestra, muestra.service, all tests |

---

## [PR 1] Phase 1: Models & Schema Foundation

Este primer Pull Request sienta las bases de la base de datos y la estructura del esquema. Todo es puramente estructural y no afecta todavía a la lógica de negocio.

- [x] **1.1 Create `src/models/RutaPasada.ts`**
  - Crear el archivo de entidad de MikroORM utilizando `@mikro-orm/decorators/legacy`.
  - Definir la clase `RutaPasada` asociada a la tabla `'ruta_pasada'`.
  - Agregar el filtro de baja lógica global:
    `@Filter({ name: 'activo', cond: { activo: true }, default: true })`
  - Campos a incluir:
    - `@PrimaryKey({ type: 'number', autoincrement: true }) id!: number;`
    - `@Property({ type: 'string', length: 100 }) nombre!: string;`
    - `@Property({ type: 'string', columnType: 'text', nullable: true }) descripcion?: string;`
    - `@Property({ type: 'boolean', default: true }) activo: boolean = true;`

- [x] **1.2 Create `src/models/ArticuloRutaPasada.ts`**
  - Crear la entidad intermedia explícita asociada a la tabla `'articulo_ruta_pasada'`.
  - Agregar el filtro de baja lógica global:
    `@Filter({ name: 'activo', cond: { activo: true }, default: true })`
  - Incluir restricción única:
    `@Unique({ properties: ['articulo', 'rutaPasada'] })`
  - Campos a incluir:
    - `@PrimaryKey({ type: 'number', autoincrement: true }) id!: number;`
    - `@ManyToOne(() => Articulo, { deleteRule: 'restrict' }) articulo!: Articulo;`
    - `@ManyToOne(() => RutaPasada, { deleteRule: 'restrict' }) rutaPasada!: RutaPasada;`
    - `@Property({ type: 'boolean', default: true }) activo: boolean = true;`

- [x] **1.3 Update `src/models/Articulo.ts`**
  - No es necesario agregar colecciones `@OneToMany` bidireccionales a `Articulo` para mantener las entidades livianas y unidireccionales de acuerdo al patrón de diseño existente en `Marca.ts`.
  - Verificar que compile correctamente y no contenga referencias a `RutaPasadaEtapa` de forma directa si existían.

- [x] **1.4 Modify `src/models/RutaPasadaEtapa.ts`**
  - Reemplazar la relación directa `@ManyToOne(() => Articulo)` por una relación `@ManyToOne(() => RutaPasada, { deleteRule: 'restrict' }) rutaPasada!: RutaPasada;`.
  - Cambiar el decorador `@Unique({ properties: ['articulo', 'etapa'] })` a `@Unique({ properties: ['rutaPasada', 'etapa'] })`.
  - Corregir imports: remover `Articulo`, agregar `RutaPasada`.

- [x] **1.5 Update `src/models/index.ts`**
  - Exportar las nuevas entidades:
    `export * from './RutaPasada.js';`
    `export * from './ArticuloRutaPasada.js';`

---

## [PR 2] Phase 2: Core Context Updates

Este segundo Pull Request alinea las entidades de contexto físico, la lógica del servicio de validación de muestras, y reconstruye todo el arnés de tests.

- [x] **2.1 Update `src/models/LineaProduccion.ts`**
  - Agregar relación `@ManyToOne(() => RutaPasada, { deleteRule: 'restrict', nullable: true })` llamada `rutaPasadaActiva?: RutaPasada;`.
  - Importar `RutaPasada` desde `./RutaPasada.js`.

- [x] **2.2 Update `src/models/Pasada.ts`**
  - Agregar relación `@ManyToOne(() => RutaPasada, { deleteRule: 'restrict' })` llamada `rutaPasada!: RutaPasada;`.
  - Hacer la relación `articulo` nullable: `@ManyToOne(() => Articulo, { deleteRule: 'restrict', nullable: true })` y cambiar su tipo a `articulo?: Articulo;`.
  - Importar `RutaPasada` desde `./RutaPasada.js`.

- [x] **2.3 Update `src/models/Muestra.ts`**
  - Agregar relación `@ManyToOne(() => RutaPasada, { deleteRule: 'restrict' })` llamada `rutaPasada!: RutaPasada;`.
  - Hacer la relación `articulo` nullable: `@ManyToOne(() => Articulo, { deleteRule: 'restrict', nullable: true })` y cambiar su tipo a `articulo?: Articulo;`.
  - Importar `RutaPasada` desde `./RutaPasada.js`.

---

## [PR 2] Phase 3: Service Logic

- [x] **3.1 Modify `src/services/muestra.service.ts`**
  - En `registrarMuestra`, cambiar la firma de `articuloId: number` a `articuloId?: number` (o admitir `null`).
  - **Resolución de Ruta Activa:**
    - Inicializar variable `let rutaPasadaId: number;`.
    - Si se provee `pasadaId`:
      - Cargar `Pasada` poblando la relación `rutaPasada` (`em.findOne(Pasada, pasadaId, { populate: ['rutaPasada'] })`).
      - Si la pasada ya está completa/abortada, lanzar error habitual.
      - Asignar `rutaPasadaId = pasada.rutaPasada.id;`.
    - Si NO se provee `pasadaId` (Muestra al azar de calidad):
      - Cargar `LineaProduccion` poblando la relación `rutaPasadaActiva` (`em.findOne(LineaProduccion, lineaProduccionId, { populate: ['rutaPasadaActiva'] })`).
      - Si `linea.rutaPasadaActiva` es nulo o indefinido (modo puesta a punto), lanzar un error explícito descriptivo: `"No se pueden registrar muestras al azar en una línea de producción sin ruta de pasada activa (modo puesta a punto)"`.
      - Asignar `rutaPasadaId = linea.rutaPasadaActiva.id;`.
  - **Validación de Límites y Secuencia:**
    - Buscar `RutaPasadaEtapa` usando `rutaPasadaId` and `etapaId`:
      `em.findOne(RutaPasadaEtapa, { rutaPasada: rutaPasadaId, etapa: etapaId })`.
    - Si no existe, lanzar error: `"No route configuration found for route ${rutaPasadaId} and stage ${etapaId}"`.
    - Si hay `pasadaId` activo:
      - Buscar todas las etapas de la ruta ordenada por orden:
        `em.find(RutaPasadaEtapa, { rutaPasada: rutaPasadaId }, { orderBy: { orden: 'ASC' } })`.
      - Iterar y comprobar la secuencialidad verificando que las etapas anteriores tengan las muestras OK completas en esa pasada.
  - **Guardado de la Muestra:**
    - Instanciar `Muestra`.
    - Asignar `muestra.rutaPasada = em.getReference(RutaPasada, rutaPasadaId);`.
    - Asignar `muestra.articulo = articuloId ? em.getReference(Articulo, articuloId) : undefined;`.
    - Las demás asignaciones se mantienen igual.

---

## [PR 2] Phase 4: Testing & Verification

- [x] **4.1 Refactor Integration Tests in `src/models.test.ts`**
  - Registrar las nuevas entidades `RutaPasada` y `ArticuloRutaPasada` en el container MikroORM de `beforeAll` (sumando la lista a 11 entidades descubiertas).
  - Actualizar la aserción del primer test que valida el conteo a 11.
  - En el test de límites y redondeo de decimales de `RutaPasadaEtapa`:
    - Crear y persistir una instancia de `RutaPasada` con `nombre: 'Palito Bombón'`.
    - Relacionar `RutaPasadaEtapa` a la `RutaPasada` recién creada en lugar del `Articulo`.
    - Asegurar que la prueba pase y mantenga el redondeo a 3 decimales de forma exitosa.
  - En el test de creación de `Pasada` y `Muestra`:
    - Sembrar la `RutaPasada` y asociarla a la `Pasada` y a la `Muestra`.
    - Comprobar que persisten y se recuperan de forma impecable.

- [x] **4.2 Refactor Mock Seeding in `src/services/muestra.service.test.ts`**
  - Adaptar los mocks y seedings del servicio para instanciar `RutaPasada` y `RutaPasadaEtapa` correctamente.
  - Añadir un nuevo test unitario/integración que verifique que si se intenta registrar una muestra al azar (`pasadaId: undefined`) en una línea de producción sin `rutaPasadaActiva` (nula), el método lanza el error de "modo puesta a punto" de forma correcta.
  - Añadir un test que verifique el registro exitoso de una muestra al azar cuando la línea sí tiene una ruta activa, comprobando que `muestra.articulo` queda en `undefined` si no se envía.

- [x] **4.3 Verification**
  - Ejecutar `pnpm test` (o `npm test`) para garantizar que la suite de pruebas corre de forma 100% exitosa con el nuevo diseño.
