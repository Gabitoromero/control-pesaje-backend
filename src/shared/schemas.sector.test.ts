import { describe, it, expect } from 'vitest';
import { UsuarioCreateSchema, UsuarioUpdateSchema } from './schemas.js';

const base = {
  nombreApellido: 'Ana Test',
  nombreUsuario: 'anatest',
  legajo: '12345',
  pin: '1234',
  rol: 'operario',
};

describe('Usuario schemas - sector', () => {
  it.each(['OF', 'SU', 'DD', 'MC'])('accepts sector %s on create', (sector) => {
    const parsed = UsuarioCreateSchema.parse({ ...base, datosAdicionales: { sector } });
    expect(parsed.datosAdicionales?.sector).toBe(sector);
  });

  it('rejects an unknown sector on create', () => {
    expect(UsuarioCreateSchema.safeParse({ ...base, datosAdicionales: { sector: 'XX' } }).success).toBe(false);
  });

  it('rejects an unknown sector on update', () => {
    expect(UsuarioUpdateSchema.safeParse({ datosAdicionales: { sector: 'oficiales' } }).success).toBe(false);
  });

  it('keeps sector optional so existing clients keep working', () => {
    expect(UsuarioCreateSchema.safeParse(base).success).toBe(true);
    expect(UsuarioCreateSchema.safeParse({ ...base, datosAdicionales: {} }).success).toBe(true);
    expect(UsuarioUpdateSchema.safeParse({ nombreApellido: 'Otro' }).success).toBe(true);
  });

  it('still accepts previous datosAdicionales fields', () => {
    const parsed = UsuarioCreateSchema.parse({
      ...base,
      datosAdicionales: { preferenciasInterfaz: { tema: 'oscuro' } },
    });
    expect(parsed.datosAdicionales?.preferenciasInterfaz?.tema).toBe('oscuro');
  });
});
