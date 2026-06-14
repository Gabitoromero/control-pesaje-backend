# ABM Pattern — Referencia de implementación

Documento de referencia para replicar el ABM de **Etapas** en las demás entidades.
Cubre backend y frontend. Cada sección indica exactamente qué copiar y qué adaptar.

---

## 1. Backend — Modelo MikroORM

Campos obligatorios van con `!` (non-null assertion). Campos opcionales van con `?` y `nullable: true`.

```ts
// src/models/MiEntidad.ts
@Entity({ tableName: 'mi_entidad' })
export class MiEntidad {
  @PrimaryKey({ type: 'number', autoincrement: true })
  id!: number;

  @Property({ type: 'string', length: 100 })
  nombre!: string;                                         // obligatorio

  @Property({ type: 'string', columnType: 'text', nullable: true })
  descripcion?: string;                                    // opcional → nullable en DB

  @Property({ type: 'boolean', default: true })
  activo: boolean = true;                                  // siempre presente, default true
}
```

---

## 2. Backend — Zod schemas (`src/shared/schemas.ts`)

Reglas fijas:
- Campos obligatorios: `z.string().min(1)`
- `descripcion` siempre: `z.string().min(4).nullable().optional()` — acepta string, null, o ausente
- `activo` siempre: `z.boolean().optional()` — permite reactivación por PUT
- `UpdateSchema = CreateSchema.partial()` — todos los campos opcionales en update

```ts
export const MiEntidadCreateSchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().min(4).nullable().optional(),
  activo: z.boolean().optional(),
  // agregar campos específicos de la entidad antes de descripcion
});

export const MiEntidadUpdateSchema = MiEntidadCreateSchema.partial();
```

---

## 3. Backend — Ruta (`src/routes/mi-entidad.routes.ts`)

```ts
import { MiEntidadCreateSchema, MiEntidadUpdateSchema } from '../utils/schemas.js';

router.use(authenticateJWT);
router.get('/', list);
router.get('/inactive', listInactive);
router.get('/:id', getOne);
router.post('/', requireRoles(writeRoles), validateBody(MiEntidadCreateSchema), create);
router.put('/:id', requireRoles(writeRoles), validateBody(MiEntidadUpdateSchema), update);
router.delete('/:id', requireRoles(writeRoles), remove);
```

No hay controller propio — `createCrudHandlers(service)` lo genera todo.

---

## 4. Frontend — Interface TypeScript (`src/api/mi-entidad.ts`)

- Campos opcionales DB-nullable: `string | null` — acepta null explícito para borrar
- `activo` siempre `?: boolean`

```ts
export interface MiEntidad {
  id?: number;
  nombre: string;
  descripcion?: string | null;   // null = borrar el valor en DB
  activo?: boolean;
}

export type MiEntidadCreate = Omit<MiEntidad, 'id'>;
```

---

## 5. Frontend — Page (`src/features/dashboard/pages/MiEntidadPage.tsx`)

### Estado y constantes

```ts
const EMPTY_FORM = { nombre: '', descripcion: '' };

const MI_ENTIDAD_FIELDS: SearchField[] = [
  { value: 'nombre', label: 'Nombre' },
  { value: 'descripcion', label: 'Descripción' },
];

// En el componente:
const [status, setStatus] = useState<'activo' | 'inactivo'>('activo');
const [field, setField] = useState('nombre');
const [query, setQuery] = useState('');
```

### Filtrado con useMemo

```ts
const entidadesFiltradas = useMemo(() => {
  const base = status === 'activo' ? activas : inactivas;
  const q = query.trim().toLowerCase();
  let result = base;
  if (q) {
    result = base.filter((e) =>
      String(e[field as keyof MiEntidad] ?? '').toLowerCase().includes(q)
    );
  }
  return [...result].sort((a, b) => a.nombre.localeCompare(b.nombre));
}, [activas, inactivas, status, field, query]);
```

### handleSubmit — regla crítica de null vs undefined

```ts
const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
  e.preventDefault();
  if (editingEntidad?.id) {
    // UPDATE: vacío → null para borrar en DB
    updateMutation.mutate({
      id: editingEntidad.id,
      data: {
        nombre: formData.nombre,
        descripcion: formData.descripcion.trim() || null,
      },
    });
  } else {
    // CREATE: vacío → undefined para omitir (DB usa default null)
    createMutation.mutate({
      nombre: formData.nombre,
      descripcion: formData.descripcion || undefined,
      activo: true,   // siempre explícito en create
    });
  }
};
```

### handleActivar

```ts
const handleActivar = () => {
  if (!editingEntidad?.id) return;
  updateMutation.mutate({
    id: editingEntidad.id,
    data: {
      nombre: formData.nombre,
      descripcion: formData.descripcion.trim() || null,
      activo: true,
    },
  });
};
```

### onError — obligatorio en TODAS las mutations

```ts
onError: (err: unknown) => {
  let msg = 'Ocurrió un error inesperado';
  if (isAxiosError(err)) {
    msg = err.response?.data?.error?.message || err.message;
  } else if (err instanceof Error) {
    msg = err.message;
  }
  alert(`No se pudo guardar:\n${msg}`);
},
```

### Modal — layout del footer

```tsx
<div className="mt-6 flex justify-end gap-3">
  {/* Activar — solo para inactivas */}
  {editingEntidad?.activo === false && (
    <button type="button" disabled={isBusy} onClick={handleActivar}
      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 mr-auto">
      Activar Entidad
    </button>
  )}
  {/* Eliminar — solo para activas */}
  {editingEntidad?.id && editingEntidad?.activo !== false && (
    <button type="button" disabled={isBusy || deleteMutation.isPending} onClick={handleDelete}
      className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 mr-auto flex items-center gap-2">
      <Trash size={18} /> {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar Entidad'}
    </button>
  )}
  <button type="button" onClick={closeModal}
    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
    Cancelar
  </button>
  <button type="submit" disabled={isBusy}
    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
    {isBusy ? 'Guardando...' : 'Guardar'}
  </button>
</div>
```

### Inputs del form — reglas

- Obligatorios: `required` + `placeholder="Ej: ..."`
- Opcionales: sin `required`, label con `(opcional)`, `minLength={4}` en textarea

```tsx
{/* Obligatorio */}
<input type="text" required placeholder="Ej: Amasado"
  className="... placeholder:text-gray-400" />

{/* Opcional */}
<label>Descripción <span className="text-gray-400 font-normal">(opcional)</span></label>
<textarea minLength={4} placeholder="Ej: Proceso de preparación inicial"
  className="... placeholder:text-gray-400" />
```

---

## 6. Tests

### Backend — `src/shared/schemas.test.ts`

Cubrir por cada entidad:
- `CreateSchema` acepta `descripcion: null`
- `UpdateSchema` acepta `descripcion: null`
- `UpdateSchema` acepta `activo: true`
- Rechaza `descripcion` con menos de 4 chars

### Backend — `src/api.test.ts` (sección 4.2b)

```ts
it('PUT /api/mi-entidad/:id with descripcion:null returns 200', async () => {
  mockEm.findOne.mockResolvedValue({ id: 1, nombre: 'Test', descripcion: 'old', activo: true });
  mockEm.flush.mockResolvedValue(undefined);

  const res = await request(app)
    .put('/api/mi-entidad/1')
    .set('Authorization', `Bearer ${adminToken()}`)
    .send({ nombre: 'Test', descripcion: null });

  expect(res.status).toBe(200);
});
```

### Frontend — `MiEntidadPage.test.tsx`

Cubrir:
1. Default carga activas
2. Switch a inactivas
3. Búsqueda de texto filtra la partición
4. Botón "Activar" visible para inactivas, invisible para activas
5. Click "Activar" → PUT con `activo: true` → modal cierra
6. Editar y borrar `descripcion` → PUT con `descripcion: null` (no `''`)
7. Misma prueba para entidad inactiva

---

## Checklist de implementación

- [ ] `src/models/MiEntidad.ts` — campos `nullable: true` para opcionales
- [ ] `src/shared/schemas.ts` — `nullable().optional()` en descripcion, `activo` presente
- [ ] `src/routes/mi-entidad.routes.ts` — endpoints estándar con `validateBody`
- [ ] `src/api/mi-entidad.ts` — interface con `string | null` para nullable
- [ ] `src/features/dashboard/pages/MiEntidadPage.tsx` — SearchToolbar, null/undefined en submit, onError en todas las mutations, eliminar solo en modal
- [ ] `src/test/handlers.ts` — handlers MSW para los 5 endpoints
- [ ] `src/features/dashboard/pages/MiEntidadPage.test.tsx` — 7 escenarios mínimos
- [ ] `src/shared/schemas.test.ts` — casos nullable y activo
- [ ] `src/api.test.ts` — PUT con `null` retorna 200
