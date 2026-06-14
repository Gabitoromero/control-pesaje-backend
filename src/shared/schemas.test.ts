import { describe, expect, it } from 'vitest';
import {
  EtapaCreateSchema,
  EtapaUpdateSchema,
  ArticuloCreateSchema,
  ArticuloUpdateSchema,
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
