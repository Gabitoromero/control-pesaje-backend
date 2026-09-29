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
  RutaPasadaEtapaCreateSchema,
  PasadaIniciarSchema,
  PasadaUpdateSchema,
  MuestraRegistrarSchema,
  MuestraUpdateSchema,
  UsuarioCreateSchema,
  ToleranciaConfigUpdateSchema,
} from './schemas.js';
import { UsuarioRol } from './types.js';

describe('UsuarioCreateSchema', () => {
  it('accepts valid 5-digit legajo', () => {
    const parsed = UsuarioCreateSchema.parse({
      nombreApellido: 'Juan Perez',
      nombreUsuario: 'juanp',
      legajo: '12345',
      pin: '1234',
      rol: UsuarioRol.OPERARIO
    });
    expect(parsed.legajo).toBe('12345');
  });

  it('rejects legajo with invalid length', () => {
    const result = UsuarioCreateSchema.safeParse({
      nombreApellido: 'Juan Perez',
      nombreUsuario: 'juanp',
      legajo: '1234',
      pin: '1234',
      rol: UsuarioRol.OPERARIO
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-numeric legajo', () => {
    const result = UsuarioCreateSchema.safeParse({
      nombreApellido: 'Juan Perez',
      nombreUsuario: 'juanp',
      legajo: '12A45',
      pin: '1234',
      rol: UsuarioRol.OPERARIO
    });
    expect(result.success).toBe(false);
  });
});

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
  it('accepts valid codigo + nombre', () => {
    const parsed = ArticuloCreateSchema.parse({ codigo: 'Harina 000', nombre: 'Morixe' });
    expect(parsed.codigo).toBe('Harina 000');
    expect(parsed.nombre).toBe('Morixe');
  });

  it('accepts descripcion: null (nullable field)', () => {
    const parsed = ArticuloCreateSchema.parse({ codigo: 'Harina 000', nombre: 'Morixe', descripcion: null });
    expect(parsed.descripcion).toBeNull();
  });

  it('accepts omitted descripcion', () => {
    const parsed = ArticuloCreateSchema.parse({ codigo: 'Harina 000', nombre: 'Morixe' });
    expect(parsed.descripcion).toBeUndefined();
  });

  it('rejects missing nombre', () => {
    const result = ArticuloCreateSchema.safeParse({ codigo: 'Harina 000' });
    expect(result.success).toBe(false);
  });
});

describe('ArticuloUpdateSchema', () => {
  it('accepts descripcion: null to clear the field', () => {
    const parsed = ArticuloUpdateSchema.parse({ codigo: 'Harina 000', descripcion: null });
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

  it('accepts nested etapas array without rutaPasada', () => {
    const parsed = RutaPasadaCreateSchema.parse({
      nombre: 'Ruta A',
      etapas: [
        {
          etapa: 1,
          orden: 1,
          pesoIdeal: 10,
          pesoMinimo: 9,
          pesoMaximo: 11,
          cantidadMuestrasRequeridas: 5,
        }
      ]
    });
    expect(parsed.etapas).toBeDefined();
    expect(parsed.etapas![0].etapa).toBe(1);
    expect((parsed.etapas![0] as any).rutaPasada).toBeUndefined();
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

  it('accepts nested etapas array for update', () => {
    const parsed = RutaPasadaUpdateSchema.parse({
      etapas: [
        {
          articulo: 1,
          etapa: 1,
          orden: 1,
          pesoIdeal: 10,
          pesoMinimo: 9,
          pesoMaximo: 11,
          cantidadMuestrasRequeridas: 5,
        }
      ]
    });
    expect(parsed.etapas).toBeDefined();
    expect(parsed.etapas![0].pesoIdeal).toBe(10);
  });
});

describe('LineaProduccionCreateSchema', () => {
  it('accepts null rutaPasadaActiva (nullable FK)', () => {
    const parsed = LineaProduccionCreateSchema.parse({
      nombre: 'Linea 1',
      articuloId: 2,
      idBalanza: 3,
      rutaPasadaActiva: null,
    });
    expect(parsed.rutaPasadaActiva).toBeNull();
  });

  it('accepts omitted rutaPasadaActiva (optional FK)', () => {
    const parsed = LineaProduccionCreateSchema.parse({
      nombre: 'Linea 1',
      articuloId: 2,
      idBalanza: 3,
    });
    expect(parsed.rutaPasadaActiva).toBeUndefined();
  });

  it('accepts a positive integer FK', () => {
    const parsed = LineaProduccionCreateSchema.parse({
      nombre: 'Linea 1',
      articuloId: 2,
      idBalanza: 3,
      rutaPasadaActiva: 5,
    });
    expect(parsed.rutaPasadaActiva).toBe(5);
  });

  it('accepts optional observacion', () => {
    const parsed = LineaProduccionCreateSchema.parse({
      nombre: 'Linea 1',
      articuloId: 2,
      idBalanza: 3,
      observacion: 'linea reservada para lote especial',
    });
    expect(parsed.observacion).toBe('linea reservada para lote especial');
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

  it('accepts null observacion to clear the value', () => {
    const parsed = LineaProduccionUpdateSchema.parse({ observacion: null });
    expect(parsed.observacion).toBeNull();
  });

  it('rejects empty string observacion', () => {
    const result = LineaProduccionUpdateSchema.safeParse({ observacion: '' });
    expect(result.success).toBe(false);
  });
});

// ─── PasadaIniciarSchema ──────────────────────────────────────────────────────

describe('PasadaIniciarSchema', () => {
  it('accepts valid lineaProduccionId and idBalanza', () => {
    const parsed = PasadaIniciarSchema.parse({ lineaProduccionId: 1, idBalanza: 3 });
    expect(parsed.lineaProduccionId).toBe(1);
    expect(parsed.idBalanza).toBe(3);
  });

  it('rejects missing lineaProduccionId', () => {
    const result = PasadaIniciarSchema.safeParse({ idBalanza: 3 });
    expect(result.success).toBe(false);
  });

  it('rejects missing idBalanza', () => {
    const result = PasadaIniciarSchema.safeParse({ lineaProduccionId: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer lineaProduccionId', () => {
    const result = PasadaIniciarSchema.safeParse({ lineaProduccionId: 1.5, idBalanza: 3 });
    expect(result.success).toBe(false);
  });

  it('rejects zero or negative ids', () => {
    const result = PasadaIniciarSchema.safeParse({ lineaProduccionId: 0, articuloId: -1 });
    expect(result.success).toBe(false);
  });

  it('accepts optional observacion', () => {
    const parsed = PasadaIniciarSchema.parse({
      lineaProduccionId: 1,
      idBalanza: 3,
      observacion: 'lote nuevo de materia prima',
    });
    expect(parsed.observacion).toBe('lote nuevo de materia prima');
  });

  it('accepts omitted observacion', () => {
    const parsed = PasadaIniciarSchema.parse({ lineaProduccionId: 1, idBalanza: 3 });
    expect(parsed.observacion).toBeUndefined();
  });

  it('rejects empty string observacion', () => {
    const result = PasadaIniciarSchema.safeParse({
      lineaProduccionId: 1,
      idBalanza: 3,
      observacion: '',
    });
    expect(result.success).toBe(false);
  });
});

// ─── PasadaUpdateSchema ───────────────────────────────────────────────────────

describe('PasadaUpdateSchema', () => {
  it('accepts empty body (all fields optional)', () => {
    const parsed = PasadaUpdateSchema.parse({});
    expect(parsed.action).toBeUndefined();
    expect(parsed.motivoCierre).toBeUndefined();
  });

  it('accepts action completar without motivoCierre', () => {
    const parsed = PasadaUpdateSchema.parse({ action: 'completar' });
    expect(parsed.action).toBe('completar');
  });

  it('accepts action abortar with motivoCierre', () => {
    const parsed = PasadaUpdateSchema.parse({ action: 'abortar', motivoCierre: 'Equipo averiado' });
    expect(parsed.action).toBe('abortar');
    expect(parsed.motivoCierre).toBe('Equipo averiado');
  });

  it('rejects action abortar without motivoCierre (refine rule)', () => {
    const result = PasadaUpdateSchema.safeParse({ action: 'abortar' });
    expect(result.success).toBe(false);
  });

  it('rejects action abortar with empty motivoCierre', () => {
    const result = PasadaUpdateSchema.safeParse({ action: 'abortar', motivoCierre: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown action value', () => {
    const result = PasadaUpdateSchema.safeParse({ action: 'pausar' });
    expect(result.success).toBe(false);
  });

  it('accepts optional observacionCierre', () => {
    const parsed = PasadaUpdateSchema.parse({ observacionCierre: 'nota adicional' });
    expect(parsed.observacionCierre).toBe('nota adicional');
  });

  it('accepts observacion as a string', () => {
    const parsed = PasadaUpdateSchema.parse({ observacion: 'nota actualizada' });
    expect(parsed.observacion).toBe('nota actualizada');
  });

  it('accepts observacion as null to clear the value', () => {
    const parsed = PasadaUpdateSchema.parse({ observacion: null });
    expect(parsed.observacion).toBeNull();
  });

  it('rejects empty string observacion', () => {
    const result = PasadaUpdateSchema.safeParse({ observacion: '' });
    expect(result.success).toBe(false);
  });
});

// ─── MuestraRegistrarSchema ───────────────────────────────────────────────────

describe('MuestraRegistrarSchema', () => {
  it('accepts minimal required fields', () => {
    const parsed = MuestraRegistrarSchema.parse({ etapaId: 1, lineaProduccionId: 2, pesoNeto: 50.5 });
    expect(parsed.etapaId).toBe(1);
    expect(parsed.lineaProduccionId).toBe(2);
    expect(parsed.pesoNeto).toBe(50.5);
  });

  it('accepts all optional fields', () => {
    const parsed = MuestraRegistrarSchema.parse({
      etapaId: 1,
      lineaProduccionId: 2,
      pesoNeto: 50.5,
      pasadaId: 4,
      observacion: 'todo ok',
    });
    expect(parsed.pasadaId).toBe(4);
    expect(parsed.observacion).toBe('todo ok');
  });

  it('rejects missing etapaId', () => {
    const result = MuestraRegistrarSchema.safeParse({ lineaProduccionId: 2, pesoNeto: 50 });
    expect(result.success).toBe(false);
  });

  it('rejects missing lineaProduccionId', () => {
    const result = MuestraRegistrarSchema.safeParse({ etapaId: 1, pesoNeto: 50 });
    expect(result.success).toBe(false);
  });

  it('rejects missing pesoNeto', () => {
    const result = MuestraRegistrarSchema.safeParse({ etapaId: 1, lineaProduccionId: 2 });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive pesoNeto', () => {
    const result = MuestraRegistrarSchema.safeParse({ etapaId: 1, lineaProduccionId: 2, pesoNeto: 0 });
    expect(result.success).toBe(false);
  });
});

// ─── MuestraUpdateSchema ──────────────────────────────────────────────────────

describe('MuestraUpdateSchema', () => {
  it('accepts empty body (all fields optional)', () => {
    const parsed = MuestraUpdateSchema.parse({});
    expect(parsed.pesoNeto).toBeUndefined();
    expect(parsed.observacion).toBeUndefined();
  });

  it('accepts only pesoNeto', () => {
    const parsed = MuestraUpdateSchema.parse({ pesoNeto: 48.0 });
    expect(parsed.pesoNeto).toBe(48.0);
  });

  it('accepts only observacion', () => {
    const parsed = MuestraUpdateSchema.parse({ observacion: 'revisado' });
    expect(parsed.observacion).toBe('revisado');
  });

  it('accepts null observacion to clear the field', () => {
    const parsed = MuestraUpdateSchema.parse({ observacion: null });
    expect(parsed.observacion).toBeNull();
  });

  it('rejects non-positive pesoNeto', () => {
    const result = MuestraUpdateSchema.safeParse({ pesoNeto: -1 });
    expect(result.success).toBe(false);
  });
});

describe('RutaPasadaEtapaCreateSchema', () => {
  it('accepts valid payload without rutaPasada (for nested creation)', () => {
    const parsed = RutaPasadaEtapaCreateSchema.parse({
      articulo: 1,
      etapa: 1,
      orden: 1,
      pesoIdeal: 10,
      pesoMinimo: 9,
      pesoMaximo: 11,
      cantidadMuestrasRequeridas: 5,
    });
    expect(parsed.etapa).toBe(1);
    expect(parsed.rutaPasada).toBeUndefined();
  });

  it('accepts valid payload with rutaPasada', () => {
    const parsed = RutaPasadaEtapaCreateSchema.parse({
      rutaPasada: 1,
      articulo: 1,
      etapa: 1,
      orden: 1,
      pesoIdeal: 10,
      pesoMinimo: 9,
      pesoMaximo: 11,
      cantidadMuestrasRequeridas: 5,
    });
    expect(parsed.rutaPasada).toBe(1);
  });
});

describe('ToleranciaConfigUpdateSchema', () => {
  it.each([0, 20, 12.5, 12.35, 0.01, 1.1, 75, 500, 999999.99])('accepts %s', (value) => {
    const parsed = ToleranciaConfigUpdateSchema.parse({ toleranciaPct: value });
    expect(parsed.toleranciaPct).toBe(value);
  });

  it.each([
    ['negative', -1],
    ['numeric string', '20'],
    ['null', null],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['above the decimal(8,2) storage bound', 1e7],
    ['more than 2 decimals (12.345)', 12.345],
    ['more than 2 decimals (0.001)', 0.001],
  ])('rejects %s', (_label, value) => {
    const result = ToleranciaConfigUpdateSchema.safeParse({ toleranciaPct: value });
    expect(result.success).toBe(false);
  });

  it('rejects a missing field', () => {
    expect(ToleranciaConfigUpdateSchema.safeParse({}).success).toBe(false);
  });
});
