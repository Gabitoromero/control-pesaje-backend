import { describe, expect, it } from 'vitest';
import {
  EtapaCreateSchema,
  EtapaUpdateSchema,
  ArticuloCreateSchema,
  ArticuloUpdateSchema,
  RutaPasadaCreateSchema,
  RutaPasadaUpdateSchema,
  LineaProduccionCreateSchema,
  LineaProduccionUpdateSchema,
} from './schemas.js';

describe('EtapaCreateSchema', () => {
  it('accepts valid nombre + activo', () => {
    const parsed = EtapaCreateSchema.parse({ nombre: 'Amasado', activo: true });
    expect(parsed).toHaveProperty('activo', true);
  });

  it('accepts descripcion as a valid string', () => {
    const parsed = EtapaCreateSchema.parse({ nombre: 'Amasado', descripcion: 'Proceso inicial' });
    expect(parsed.descripcion).toBe('Proceso inicial');
  });

  it('accepts descripcion: null (nullable field)', () => {
    const parsed = EtapaCreateSchema.parse({ nombre: 'Amasado', descripcion: null });
    expect(parsed.descripcion).toBeNull();
  });

  it('accepts omitted descripcion (optional field)', () => {
    const parsed = EtapaCreateSchema.parse({ nombre: 'Amasado' });
    expect(parsed.descripcion).toBeUndefined();
  });

  it('rejects descripcion shorter than 4 chars', () => {
    const result = EtapaCreateSchema.safeParse({ nombre: 'Amasado', descripcion: 'abc' });
    expect(result.success).toBe(false);
  });

  it('rejects missing nombre', () => {
    const result = EtapaCreateSchema.safeParse({ descripcion: 'sin nombre' });
    expect(result.success).toBe(false);
  });
});

describe('EtapaUpdateSchema', () => {
  it('accepts partial update — only nombre', () => {
    const parsed = EtapaUpdateSchema.parse({ nombre: 'Horneado' });
    expect(parsed.nombre).toBe('Horneado');
  });

  it('accepts descripcion: null to clear the field', () => {
    const parsed = EtapaUpdateSchema.parse({ nombre: 'Horneado', descripcion: null });
    expect(parsed.descripcion).toBeNull();
  });

  it('accepts omitting descripcion entirely', () => {
    const parsed = EtapaUpdateSchema.parse({ nombre: 'Horneado' });
    expect(parsed.descripcion).toBeUndefined();
  });

  it('accepts activo: true for reactivation', () => {
    const parsed = EtapaUpdateSchema.parse({ nombre: 'Horneado', activo: true });
    expect(parsed.activo).toBe(true);
  });

  it('rejects descripcion shorter than 4 chars', () => {
    const result = EtapaUpdateSchema.safeParse({ nombre: 'Horneado', descripcion: 'ab' });
    expect(result.success).toBe(false);
  });
});

describe('ArticuloCreateSchema', () => {
  it('accepts valid nombre + marca', () => {
    const parsed = ArticuloCreateSchema.parse({ nombre: 'Harina 000', marca: 'Morixe' });
    expect(parsed.nombre).toBe('Harina 000');
    expect(parsed.marca).toBe('Morixe');
  });

  it('accepts descripcion: null (nullable field)', () => {
    const parsed = ArticuloCreateSchema.parse({ nombre: 'Harina 000', marca: 'Morixe', descripcion: null });
    expect(parsed.descripcion).toBeNull();
  });

  it('accepts omitted descripcion', () => {
    const parsed = ArticuloCreateSchema.parse({ nombre: 'Harina 000', marca: 'Morixe' });
    expect(parsed.descripcion).toBeUndefined();
  });

  it('rejects missing marca', () => {
    const result = ArticuloCreateSchema.safeParse({ nombre: 'Harina 000' });
    expect(result.success).toBe(false);
  });
});

describe('ArticuloUpdateSchema', () => {
  it('accepts descripcion: null to clear the field', () => {
    const parsed = ArticuloUpdateSchema.parse({ nombre: 'Harina 000', descripcion: null });
    expect(parsed.descripcion).toBeNull();
  });

  it('accepts activo: true for reactivation', () => {
    const parsed = ArticuloUpdateSchema.parse({ activo: true });
    expect(parsed.activo).toBe(true);
  });
});

describe('RutaPasadaCreateSchema', () => {
  it('accepts null descripcion (nullable field)', () => {
    const parsed = RutaPasadaCreateSchema.parse({ nombre: 'Ruta A', descripcion: null });
    expect(parsed.descripcion).toBeNull();
  });

  it('accepts omitted descripcion (optional field)', () => {
    const parsed = RutaPasadaCreateSchema.parse({ nombre: 'Ruta A' });
    expect(parsed.descripcion).toBeUndefined();
  });

  it('accepts descripcion with 4 or more chars', () => {
    const parsed = RutaPasadaCreateSchema.parse({ nombre: 'Ruta A', descripcion: 'Desc' });
    expect(parsed.descripcion).toBe('Desc');
  });

  it('rejects descripcion shorter than 4 chars', () => {
    const result = RutaPasadaCreateSchema.safeParse({ nombre: 'Ruta A', descripcion: 'ab' });
    expect(result.success).toBe(false);
  });

  it('accepts activo: true', () => {
    const parsed = RutaPasadaCreateSchema.parse({ nombre: 'Ruta A', activo: true });
    expect(parsed.activo).toBe(true);
  });
});

describe('RutaPasadaUpdateSchema', () => {
  it('accepts null descripcion to clear the field', () => {
    const parsed = RutaPasadaUpdateSchema.parse({ descripcion: null });
    expect(parsed.descripcion).toBeNull();
  });

  it('accepts activo: true for reactivation', () => {
    const parsed = RutaPasadaUpdateSchema.parse({ activo: true });
    expect(parsed.activo).toBe(true);
  });

  it('accepts partial update with only nombre', () => {
    const parsed = RutaPasadaUpdateSchema.parse({ nombre: 'Ruta B' });
    expect(parsed.nombre).toBe('Ruta B');
  });
});

describe('LineaProduccionCreateSchema', () => {
  it('accepts null rutaPasadaActiva (nullable FK)', () => {
    const parsed = LineaProduccionCreateSchema.parse({
      nombre: 'Linea 1',
      numeroBalanza: 1,
      rutaPasadaActiva: null,
    });
    expect(parsed.rutaPasadaActiva).toBeNull();
  });

  it('accepts omitted rutaPasadaActiva (optional FK)', () => {
    const parsed = LineaProduccionCreateSchema.parse({ nombre: 'Linea 1', numeroBalanza: 1 });
    expect(parsed.rutaPasadaActiva).toBeUndefined();
  });

  it('accepts a positive integer FK', () => {
    const parsed = LineaProduccionCreateSchema.parse({
      nombre: 'Linea 1',
      numeroBalanza: 1,
      rutaPasadaActiva: 5,
    });
    expect(parsed.rutaPasadaActiva).toBe(5);
  });
});

describe('LineaProduccionUpdateSchema', () => {
  it('accepts null rutaPasadaActiva to clear the FK', () => {
    const parsed = LineaProduccionUpdateSchema.parse({ rutaPasadaActiva: null });
    expect(parsed.rutaPasadaActiva).toBeNull();
  });

  it('accepts activo: true for reactivation', () => {
    const parsed = LineaProduccionUpdateSchema.parse({ activo: true });
    expect(parsed.activo).toBe(true);
  });

  it('accepts partial update with only nombre', () => {
    const parsed = LineaProduccionUpdateSchema.parse({ nombre: 'Linea 2' });
    expect(parsed.nombre).toBe('Linea 2');
  });
});
