export type AuditAccion = 'crear' | 'editar' | 'desactivar' | 'eliminar';
export type AuditRaizTipo = 'articulo' | 'ruta' | 'etapa' | 'linea';

export interface AuditedEntityConfig {
  /** Value stored in `historial_cambio.entidad`. */
  entidad: string;
  raizTipo: AuditRaizTipo;
  /** Returns the id of the root record this change belongs to. */
  raizId: (data: Record<string, unknown>, entityId: number) => number | undefined;
}

const idOf = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  if (value && typeof value === 'object' && 'id' in value) return idOf((value as { id: unknown }).id);
  return undefined;
};

/** Entities covered by the audit trail, keyed by MikroORM entity name. */
export const AUDITED_ENTITIES: Record<string, AuditedEntityConfig> = {
  Articulo: { entidad: 'articulo', raizTipo: 'articulo', raizId: (_d, id) => id },
  Etapa: { entidad: 'etapa', raizTipo: 'etapa', raizId: (_d, id) => id },
  LineaProduccion: { entidad: 'linea', raizTipo: 'linea', raizId: (_d, id) => id },
  RutaPasada: { entidad: 'ruta', raizTipo: 'ruta', raizId: (_d, id) => id },
  RutaPasadaEtapa: { entidad: 'ruta_etapa', raizTipo: 'ruta', raizId: (d) => idOf(d.rutaPasada) },
  ArticuloRutaPasada: { entidad: 'ruta_articulo', raizTipo: 'ruta', raizId: (d) => idOf(d.rutaPasada) },
};

/** Canonical form so '1.50' (DB decimal) and 1.5 (number) compare equal. */
export const normalizeValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const id = idOf(value);
    if (id !== undefined && 'id' in (value as object)) return id;
  }
  return value ?? null;
};

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const normalizeRecord = (record: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(record).map(([k, v]) => [k, normalizeValue(v)]));

/** Only the fields that actually changed, as { antes, despues }. */
export const diffChanged = (
  original: Record<string, unknown>,
  changes: Record<string, unknown>,
): { antes: Record<string, unknown>; despues: Record<string, unknown> } => {
  const antes: Record<string, unknown> = {};
  const despues: Record<string, unknown> = {};
  for (const [key, newValue] of Object.entries(changes)) {
    const before = normalizeValue(original[key]);
    const after = normalizeValue(newValue);
    if (same(before, after)) continue;
    antes[key] = before;
    despues[key] = after;
  }
  return { antes, despues };
};

export interface AuditRecord {
  entidad: string;
  entidadId: number;
  raizTipo: AuditRaizTipo;
  raizId: number;
  accion: AuditAccion;
  antes: Record<string, unknown>;
  despues: Record<string, unknown>;
}

export interface RawChange {
  type: 'create' | 'update' | 'delete';
  name: string;
  entityId: number | undefined;
  /** Previous state (update/delete). */
  original: Record<string, unknown> | undefined;
  /** Written values (create/update). */
  payload: Record<string, unknown>;
  /** Fallback source for the root id when original/payload lack it. */
  current?: Record<string, unknown>;
}

/** Builds the audit row for a change, or undefined when it is not audited or nothing changed. */
export const buildAuditRecord = (change: RawChange): AuditRecord | undefined => {
  const config = AUDITED_ENTITIES[change.name];
  if (!config || change.entityId === undefined) return undefined;

  const source = { ...(change.current ?? {}), ...(change.original ?? {}), ...change.payload };
  const raizId = config.raizId(source, change.entityId);
  if (raizId === undefined) return undefined;

  const base = { entidad: config.entidad, entidadId: change.entityId, raizTipo: config.raizTipo, raizId };

  if (change.type === 'create') {
    return { ...base, accion: 'crear', antes: {}, despues: normalizeRecord(change.payload) };
  }
  if (change.type === 'delete') {
    return { ...base, accion: 'eliminar', antes: normalizeRecord(change.original ?? change.current ?? {}), despues: {} };
  }

  const { antes, despues } = diffChanged(change.original ?? {}, change.payload);
  if (Object.keys(despues).length === 0) return undefined;
  const desactivado = antes.activo === true && despues.activo === false;
  return { ...base, accion: desactivado ? 'desactivar' : 'editar', antes, despues };
};
