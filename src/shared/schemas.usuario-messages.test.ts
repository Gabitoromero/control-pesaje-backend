import { describe, it, expect } from 'vitest';
import { UsuarioCreateSchema } from './schemas.js';

const base = { nombreApellido: 'Ana Gómez', nombreUsuario: 'agomez', legajo: '12345', pin: '1234', rol: 'operario' };

const messageAt = (data: unknown, path: string) =>
  UsuarioCreateSchema.safeParse(data).error?.issues.find((i) => i.path.join('.') === path)?.message;

describe('UsuarioCreateSchema validation messages', () => {
  it('explains a legajo that is not 5 digits', () => {
    expect(messageAt({ ...base, legajo: '1234' }, 'legajo')).toBe('Debe tener exactamente 5 dígitos numéricos');
  });

  it('explains a nombreUsuario that is too short', () => {
    expect(messageAt({ ...base, nombreUsuario: 'ab' }, 'nombreUsuario')).toBe('Debe tener al menos 3 caracteres');
  });

  it('explains a PIN that is not 4 to 6 digits', () => {
    expect(messageAt({ ...base, pin: '12' }, 'pin')).toBe('Debe tener entre 4 y 6 dígitos numéricos');
  });

  it('explains an empty or missing nombreApellido', () => {
    expect(messageAt({ ...base, nombreApellido: '' }, 'nombreApellido')).toBe('Es obligatorio');
    expect(messageAt({ ...base, nombreApellido: undefined }, 'nombreApellido')).toBe('Es obligatorio');
  });

  it('explains an unknown rol', () => {
    expect(messageAt({ ...base, rol: 'x' }, 'rol')).toBe('Rol inválido');
  });

  it('explains an unknown sector', () => {
    expect(messageAt({ ...base, datosAdicionales: { sector: 'XX' } }, 'datosAdicionales.sector')).toBe('Sector inválido');
  });
});
