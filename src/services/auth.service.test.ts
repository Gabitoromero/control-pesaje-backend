import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthService } from './auth.service.js';
import { UsuarioRol } from '../models/Usuario.js';

const JWT_SECRET = 'test-secret';

// Mock the entity manager
const mockEm = {
  find: vi.fn(),
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

  it('returns null when user is not found', async () => {
    mockEm.findOne.mockResolvedValue(null);
    const result = await service.login('noone', 'pass');
    expect(result).toBeNull();
  });

  it('returns null when user is inactive', async () => {
    mockEm.findOne.mockResolvedValue({ activo: false, contrasenaHash: await bcrypt.hash('pass', 10) });
    const result = await service.login('inactive', 'pass');
    expect(result).toBeNull();
  });

  it('returns null when password does not match', async () => {
    mockEm.findOne.mockResolvedValue({
      id: 1,
      nombreUsuario: 'admin',
      rol: UsuarioRol.ADMINISTRADOR,
      activo: true,
      contrasenaHash: await bcrypt.hash('correct', 10),
    });
    const result = await service.login('admin', 'wrong');
    expect(result).toBeNull();
  });

  it('returns a JWT string when credentials are valid', async () => {
    const hash = await bcrypt.hash('password', 10);
    mockEm.findOne.mockResolvedValue({
      id: 1,
      nombreUsuario: 'admin',
      rol: UsuarioRol.ADMINISTRADOR,
      activo: true,
      contrasenaHash: hash,
    });

    const token = await service.login('admin', 'password');
    expect(typeof token).toBe('string');

    const decoded = jwt.verify(token!, JWT_SECRET) as any;
    expect(decoded.id).toBe(1);
    expect(decoded.nombreUsuario).toBe('admin');
    expect(decoded.rol).toBe(UsuarioRol.ADMINISTRADOR);
  });
});

describe('AuthService.validatePin', () => {
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthService();
  });

  it('returns null when user is not found', async () => {
    mockEm.findOne.mockResolvedValue(null);
    const result = await service.validatePin('123', '1234');
    expect(result).toBeNull();
  });

  it('returns null when PIN does not match', async () => {
    const pinHash = await bcrypt.hash('5678', 1);
    mockEm.findOne.mockResolvedValue(
      { id: 1, nombreApellido: 'Test User', rol: UsuarioRol.OPERARIO, activo: true, pinHash, legajo: '123' }
    );
    const result = await service.validatePin('123', '9999');
    expect(result).toBeNull();
  });

  it('returns the matching user when PIN is correct', async () => {
    const pinHash = await bcrypt.hash('1234', 1);
    mockEm.findOne.mockResolvedValue(
      { id: 1, nombreApellido: 'Test User', rol: UsuarioRol.OPERARIO, activo: true, pinHash, legajo: '123' }
    );
    const result = await service.validatePin('123', '1234');
    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
  });

  it('returns null when user has no pinHash set', async () => {
    mockEm.findOne.mockResolvedValue(
      { id: 1, nombreApellido: 'Sin PIN', rol: UsuarioRol.OPERARIO, activo: true, pinHash: undefined, legajo: '123' }
    );
    const result = await service.validatePin('123', '1234');
    expect(result).toBeNull();
  });
});
describe('AuthService.hashPassword', () => {
  it('returns a bcrypt hash', async () => {
    const service = new AuthService();
    const hash = await service.hashPassword('mypassword');
    expect(hash).not.toBe('mypassword');
    const valid = await bcrypt.compare('mypassword', hash);
    expect(valid).toBe(true);
  });
});
