import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsuarioService } from './usuario.service.js';
import { ValidationError } from '../utils/errors.js';

// ─── Mock EntityManager ───────────────────────────────────────────────────────

const mockEm = {
  find: vi.fn(),
  findOne: vi.fn(),
  count: vi.fn(),
  flush: vi.fn(),
  persist: vi.fn().mockReturnThis(),
  create: vi.fn((entity, data) => data),
};

vi.mock('@mikro-orm/core', () => ({
  RequestContext: {
    getEntityManager: vi.fn(() => mockEm),
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-pin'),
  },
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UsuarioService', () => {
  let service: UsuarioService;
  
  beforeEach(() => {
    vi.clearAllMocks();
    service = new UsuarioService();
  });

  describe('create', () => {
    it('throws ValidationError when legajo is already taken', async () => {
      mockEm.findOne.mockResolvedValueOnce({ id: 2, legajo: '1234', nombreApellido: 'Otro Usuario' });

      await expect(
        service.create({
          nombreApellido: 'Test',
          legajo: '1234',
        } as any)
      ).rejects.toThrow(ValidationError);

      mockEm.findOne.mockResolvedValueOnce({ id: 2, legajo: '1234', nombreApellido: 'Otro Usuario' });
      await expect(
        service.create({
          nombreApellido: 'Test',
          legajo: '1234',
        } as any)
      ).rejects.toThrow("El legajo 1234 ya está en uso por Otro Usuario");
    });
  });

  describe('update', () => {
    it('throws ValidationError when attempting to modify an esSistema user', async () => {
      mockEm.findOne.mockResolvedValueOnce({ id: 1, esSistema: true, legajo: '0000' });

      await expect(
        service.update(1, {
          nombreApellido: 'Hacker',
        } as any)
      ).rejects.toThrow(ValidationError);

      // Need to reset the mock for the second assertion
      mockEm.findOne.mockResolvedValueOnce({ id: 1, esSistema: true, legajo: '0000' });
      await expect(
        service.update(1, {
          nombreApellido: 'Hacker',
        } as any)
      ).rejects.toThrow("No se permite la modificación de usuarios de sistema");
    });

    it('throws ValidationError when updated legajo is taken by another user', async () => {
      // First findOne is for finding the user to update
      mockEm.findOne.mockResolvedValueOnce({ id: 1, esSistema: false, legajo: '1111' });
      // Second findOne is for checkUniqueLegajo
      mockEm.findOne.mockResolvedValueOnce({ id: 2, legajo: '2222', nombreApellido: 'Admin' });

      await expect(
        service.update(1, {
          legajo: '2222',
        } as any)
      ).rejects.toThrow("El legajo 2222 ya está en uso por Admin");
    });
  });

  describe('softDelete', () => {
    it('throws ValidationError when attempting to delete an esSistema user', async () => {
      mockEm.findOne.mockResolvedValueOnce({ id: 1, esSistema: true, legajo: '0000' });

      await expect(
        service.softDelete(1)
      ).rejects.toThrow(ValidationError);

      mockEm.findOne.mockResolvedValueOnce({ id: 1, esSistema: true, legajo: '0000' });
      await expect(
        service.softDelete(1)
      ).rejects.toThrow("No se permite eliminar usuarios de sistema");
    });
    
    it('soft deletes a non-system user', async () => {
      const user = { id: 2, esSistema: false, activo: true };
      mockEm.findOne.mockResolvedValueOnce(user).mockResolvedValueOnce(user);

      const result = await service.softDelete(2);
      expect(result).toBe(true);
      expect(user.activo).toBe(false);
      expect(mockEm.flush).toHaveBeenCalled();
    });
  });
});
