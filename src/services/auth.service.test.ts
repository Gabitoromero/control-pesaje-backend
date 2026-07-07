import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthService } from './auth.service.js';
import { UsuarioRol } from '../models/Usuario.js';

const JWT_SECRET = 'test-secret';

// Mock the entity manager
const mockEm = {
  findOne: vi.fn(),
};

vi.mock('@mikro-orm/core', () => ({
  RequestContext: {
    getEntityManager: vi.fn(() => mockEm),
  },
}));

describe('AuthService.login', () => {
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = JWT_SECRET;
    service = new AuthService();
  });

  it('returns a JWT string when login is successful', async () => {
    const pinHash = await bcrypt.hash('1234', 10);
    mockEm.findOne.mockResolvedValue({
      id: 1,
      nombreUsuario: 'admin',
      legajo: 'ADMIN01',
      rol: UsuarioRol.ADMINISTRADOR,
      activo: true,
      pinHash,
      puedeTomarMuestrasLibres: true
    });

    const token = await service.login('ADMIN01', '1234');
    expect(typeof token).toBe('string');
  });

  it('decoded JWT contains expected claims including puedeTomarMuestrasLibres', async () => {
    const pinHash = await bcrypt.hash('1234', 10);
    mockEm.findOne.mockResolvedValue({
      id: 2,
      nombreUsuario: 'jefe',
      legajo: 'JEFE01',
      rol: UsuarioRol.JEFE,
      activo: true,
      pinHash,
      puedeTomarMuestrasLibres: false
    });

    const token = await service.login('JEFE01', '1234');
    const decoded = jwt.verify(token!, JWT_SECRET) as any;
    
    expect(decoded.id).toBe(2);
    expect(decoded.nombreUsuario).toBe('jefe');
    expect(decoded.legajo).toBe('JEFE01');
    expect(decoded.rol).toBe(UsuarioRol.JEFE);
    expect(decoded.puedeTomarMuestrasLibres).toBe(false);
  });

  it('decoded JWT exp is ~12h from now', async () => {
    const pinHash = await bcrypt.hash('1234', 10);
    mockEm.findOne.mockResolvedValue({
      id: 1,
      nombreUsuario: 'admin',
      legajo: 'ADMIN01',
      rol: UsuarioRol.ADMINISTRADOR,
      activo: true,
      pinHash,
      puedeTomarMuestrasLibres: true
    });

    const token = await service.login('ADMIN01', '1234');
    const decoded = jwt.verify(token!, JWT_SECRET) as any;
    
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const expectedExp = nowInSeconds + 12 * 60 * 60;
    
    // Check it's within a few seconds of 12 hours from now
    expect(decoded.exp).toBeGreaterThan(expectedExp - 5);
    expect(decoded.exp).toBeLessThan(expectedExp + 5);
  });

  it('returns null when legajo is unknown', async () => {
    mockEm.findOne.mockResolvedValue(null);
    const result = await service.login('UNKNOWN', '1234');
    expect(result).toBeNull();
  });

  it('returns null when pin is wrong', async () => {
    const pinHash = await bcrypt.hash('1234', 10);
    mockEm.findOne.mockResolvedValue({
      id: 1,
      nombreUsuario: 'admin',
      legajo: 'ADMIN01',
      rol: UsuarioRol.ADMINISTRADOR,
      activo: true,
      pinHash,
      puedeTomarMuestrasLibres: true
    });
    
    const result = await service.login('ADMIN01', '9999');
    expect(result).toBeNull();
  });

  it('returns null when user is inactive', async () => {
    const pinHash = await bcrypt.hash('1234', 10);
    mockEm.findOne.mockResolvedValue({
      id: 1,
      nombreUsuario: 'admin',
      legajo: 'ADMIN01',
      rol: UsuarioRol.ADMINISTRADOR,
      activo: false,
      pinHash,
      puedeTomarMuestrasLibres: true
    });
    
    // Auth service is supposed to query with { legajo, activo: true }
    // but in case it checks manually after fetching or relies on DB:
    const result = await service.login('ADMIN01', '1234');
    expect(result).toBeNull();
  });

  it('returns a JWT when logging in with nombreUsuario instead of legajo', async () => {
    const pinHash = await bcrypt.hash('1234', 10);
    mockEm.findOne.mockResolvedValue({
      id: 3,
      nombreUsuario: 'operario01',
      legajo: 'LEG-3',
      rol: UsuarioRol.OPERARIO,
      activo: true,
      pinHash,
      puedeTomarMuestrasLibres: false
    });

    const token = await service.login('operario01', '1234');
    expect(typeof token).toBe('string');
    const decoded = jwt.verify(token!, JWT_SECRET) as any;
    expect(decoded.nombreUsuario).toBe('operario01');
    expect(decoded.legajo).toBe('LEG-3');
  });

  it('returns null when neither legajo nor nombreUsuario matches', async () => {
    mockEm.findOne.mockResolvedValue(null);
    const result = await service.login('no-existe', '1234');
    expect(result).toBeNull();
  });

  it('throws when JWT_SECRET is not configured', async () => {
    delete process.env.JWT_SECRET;
    const pinHash = await bcrypt.hash('1234', 10);
    mockEm.findOne.mockResolvedValue({
      id: 1,
      nombreUsuario: 'admin',
      legajo: 'ADMIN01',
      rol: UsuarioRol.ADMINISTRADOR,
      activo: true,
      pinHash,
      puedeTomarMuestrasLibres: true
    });

    await expect(service.login('ADMIN01', '1234')).rejects.toThrow('JWT_SECRET not configured');
  });
});

describe('AuthService.findLineaById', () => {
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthService();
  });

  it('returns LineaProduccion when found', async () => {
    const linea = { id: 1, nombre: 'Línea 1', activo: true };
    mockEm.findOne.mockResolvedValue(linea);

    const result = await service.findLineaById(1);

    expect(result).toEqual(linea);
    expect(mockEm.findOne).toHaveBeenCalledWith(expect.any(Function), { id: 1 });
  });

  it('returns null when not found', async () => {
    mockEm.findOne.mockResolvedValue(null);

    const result = await service.findLineaById(999);

    expect(result).toBeNull();
  });
});
