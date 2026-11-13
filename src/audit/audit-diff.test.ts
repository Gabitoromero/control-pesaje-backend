import { describe, it, expect } from 'vitest';
import { buildAuditRecord, diffChanged, normalizeValue } from './audit-diff.js';

describe('normalizeValue', () => {
  it("treats '1.50' and 1.5 as the same value", () => {
    expect(normalizeValue('1.50')).toBe(1.5);
    expect(normalizeValue(1.5)).toBe(1.5);
  });
  it('keeps non-numeric strings and maps undefined to null', () => {
    expect(normalizeValue('ABC-1')).toBe('ABC-1');
    expect(normalizeValue(undefined)).toBeNull();
  });
  it('reduces a relation to its id', () => {
    expect(normalizeValue({ id: 7 })).toBe(7);
  });
});

describe('diffChanged', () => {
  it('returns only fields that really changed, ignoring decimal formatting', () => {
    const { antes, despues } = diffChanged({ pesoMinimo: '1.50', nombre: 'A' }, { pesoMinimo: 1.5, nombre: 'B' });
    expect(antes).toEqual({ nombre: 'A' });
    expect(despues).toEqual({ nombre: 'B' });
  });
});

describe('buildAuditRecord', () => {
  it('create: antes empty, despues holds the payload', () => {
    const r = buildAuditRecord({ type: 'create', name: 'Articulo', entityId: 3, original: undefined, payload: { codigo: 'X', activo: true } });
    expect(r).toMatchObject({ accion: 'crear', entidad: 'articulo', raizTipo: 'articulo', raizId: 3, antes: {}, despues: { codigo: 'X', activo: true } });
  });

  it('update: stores only changed fields', () => {
    const r = buildAuditRecord({ type: 'update', name: 'Etapa', entityId: 2, original: { nombre: 'A', descripcion: 'd' }, payload: { nombre: 'B', descripcion: 'd' } });
    expect(r).toMatchObject({ accion: 'editar', antes: { nombre: 'A' }, despues: { nombre: 'B' } });
  });

  it('update with no effective change produces no row', () => {
    expect(buildAuditRecord({ type: 'update', name: 'Etapa', entityId: 2, original: { nombre: 'A' }, payload: { nombre: 'A' } })).toBeUndefined();
  });

  it('activo true -> false is classified as desactivar', () => {
    const r = buildAuditRecord({ type: 'update', name: 'Articulo', entityId: 1, original: { activo: true }, payload: { activo: false } });
    expect(r?.accion).toBe('desactivar');
  });

  it('delete: antes keeps the complete record', () => {
    const r = buildAuditRecord({ type: 'delete', name: 'Articulo', entityId: 1, original: { codigo: 'X', nombre: 'N', activo: true }, payload: {} });
    expect(r).toMatchObject({ accion: 'eliminar', antes: { codigo: 'X', nombre: 'N', activo: true }, despues: {} });
  });

  it('ruta etapa change is rooted at its ruta, including tolerancia', () => {
    const r = buildAuditRecord({
      type: 'update',
      name: 'RutaPasadaEtapa',
      entityId: 50,
      original: { rutaPasada: 9, toleranciaPct: '5.00' },
      payload: { toleranciaPct: 7 },
    });
    expect(r).toMatchObject({ entidad: 'ruta_etapa', entidadId: 50, raizTipo: 'ruta', raizId: 9, antes: { toleranciaPct: 5 }, despues: { toleranciaPct: 7 } });
  });

  it('articulo assigned to a ruta: physical delete is audited under the ruta', () => {
    const r = buildAuditRecord({ type: 'delete', name: 'ArticuloRutaPasada', entityId: 4, original: { articulo: 11, rutaPasada: 9 }, payload: {} });
    expect(r).toMatchObject({ entidad: 'ruta_articulo', raizTipo: 'ruta', raizId: 9, accion: 'eliminar', antes: { articulo: 11, rutaPasada: 9 } });
  });

  it('ignores entities that are not audited', () => {
    expect(buildAuditRecord({ type: 'create', name: 'Dispositivo', entityId: 1, original: undefined, payload: {} })).toBeUndefined();
    expect(buildAuditRecord({ type: 'create', name: 'HistorialCambio', entityId: 1, original: undefined, payload: {} })).toBeUndefined();
  });
});
