import { describe, it, expect, vi } from 'vitest';
import type { EntityManager } from '@mikro-orm/core';
import { resolveContextos, resolveReferences } from './historial-cambio.service.js';

const emWith = (rowsByEntity: Record<string, unknown[]>) =>
  ({ find: vi.fn(async (entity: { name: string }) => rowsByEntity[entity.name] ?? []) }) as unknown as EntityManager;

describe('resolveReferences', () => {
  it('maps referenced ids to current names, per field', async () => {
    const em = emWith({
      Articulo: [{ id: 29, codigo: 'A29', nombre: 'Cono' }, { id: 6, codigo: 'A6' }],
      RutaPasada: [{ id: 3, nombre: 'Ruta Calibracion' }],
    });
    const refs = await resolveReferences(em, [
      { antes: {}, despues: { articulo: 29, rutaPasada: 3 } },
      { antes: { id: 6, articulo: 6, rutaPasada: 3 }, despues: {} },
    ]);
    expect(refs).toEqual({
      articulo: { '29': 'A29 - Cono', '6': 'A6' },
      rutaPasada: { '3': 'Ruta Calibracion' },
    });
  });

  it('ignores non-reference fields and ids that no longer exist, and queries nothing when there are none', async () => {
    const em = emWith({ Articulo: [] });
    expect(await resolveReferences(em, [{ antes: { nombre: 'x' }, despues: { articulo: 99 } }])).toEqual({ articulo: {} });
    const none = emWith({});
    expect(await resolveReferences(none, [{ antes: { nombre: 'x' }, despues: { activo: false } }])).toEqual({});
    expect(none.find).not.toHaveBeenCalled();
  });
});

describe('resolveContextos', () => {
  it('names the etapa of a ruta_etapa change from the row when the diff has no etapa, and from the diff when it has', async () => {
    const em = {
      find: vi.fn(async () => [{ id: 11, etapa: { id: 7 } }]),
    } as unknown as EntityManager;
    const ref = await resolveContextos(em, [
      { id: 1, entidad: 'ruta_etapa', entidadId: 11, antes: { toleranciaPct: null }, despues: { toleranciaPct: 7 } },
      { id: 2, entidad: 'ruta_etapa', entidadId: 12, antes: {}, despues: { etapa: 9, orden: 2 } },
      { id: 3, entidad: 'articulo', entidadId: 5, antes: {}, despues: { nombre: 'x' } },
    ]);
    expect(ref.get(1)).toEqual({ field: 'etapa', id: 7 });
    expect(ref.get(2)).toEqual({ field: 'etapa', id: 9 });
    expect(ref.has(3)).toBe(false);
    expect(em.find).toHaveBeenCalledTimes(1);
  });
});
