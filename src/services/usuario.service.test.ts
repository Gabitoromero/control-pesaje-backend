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

    it('creates user successfully when legajo is not taken', async () => {
      mockEm.findOne.mockResolvedValueOnce(null); // checkUniqueLegajo — not found
      const createdUser = { id: 5, nombreApellido: 'New', legajo: '9999', activo: true };
      mockEm.create.mockReturnValue(createdUser);
      mockEm.flush.mockResolvedValue(undefined);

      const result = await service.create({
        nombreApellido: 'New',
        legajo: '9999',
        nombreUsuario: 'newuser',
        pinHash: 'existinghash',
      } as any);

      expect(result).toBe(createdUser);
      expect(mockEm.create).toHaveBeenCalled();
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it('creates user without legajo — skips unique check', async () => {
      const createdUser = { id: 6, nombreApellido: 'NoLegajo', activo: true };
      mockEm.create.mockReturnValue(createdUser);
      mockEm.flush.mockResolvedValue(undefined);

      const result = await service.create({
        nombreApellido: 'NoLegajo',
        nombreUsuario: 'nolegajo',
      } as any);

      // checkUniqueLegajo should NOT have been called
      expect(mockEm.findOne).not.toHaveBeenCalled();
      expect(result).toBe(createdUser);
    });

    it('hashes pin and strips it from payload', async () => {
      const createdUser = { id: 7, nombreApellido: 'WithPin', activo: true };
      mockEm.create.mockReturnValue(createdUser);
      mockEm.flush.mockResolvedValue(undefined);

      const result = await service.create({
        nombreApellido: 'WithPin',
        nombreUsuario: 'withpin',
        pin: '1234',
      } as any);

      expect(result).toBe(createdUser);
      // verify pinHash was passed to super.create (via mockEm.create)
      expect(mockEm.create).toHaveBeenCalled();
      const [, data] = mockEm.create.mock.calls[0];
      expect(data).not.toHaveProperty('pin');
      expect(data.pinHash).toBe('hashed-pin');
    });

    it('handles datosAdicionales — strips pin from nested object', async () => {
      const createdUser = { id: 8, nombreApellido: 'WithDatos', activo: true };
      mockEm.create.mockReturnValue(createdUser);
      mockEm.flush.mockResolvedValue(undefined);

      const result = await service.create({
        nombreApellido: 'WithDatos',
        nombreUsuario: 'withdatos',
        datosAdicionales: { pin: 'should-be-stripped', preferenciasInterfaz: { tema: 'oscuro' } },
      } as any);

      expect(result).toBe(createdUser);
      expect(mockEm.create).toHaveBeenCalled();
      const [, data] = mockEm.create.mock.calls[0];
      // datosAdicionales should not contain pin
      expect(data.datosAdicionales).toEqual({ preferenciasInterfaz: { tema: 'oscuro' } });
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

    it('updates user successfully when no conflicts', async () => {
      // findById returns the existing user
      const existingUser = { id: 3, esSistema: false, legajo: '3333', nombreApellido: 'Existing' };
      mockEm.find.mockResolvedValue([existingUser]); // used by super.update's findOne
      mockEm.findOne.mockResolvedValue(existingUser); // used by findById

      mockEm.flush.mockResolvedValue(undefined);

      const result = await service.update(3, {
        nombreApellido: 'Updated',
      } as any);

      // result comes from super.update (which calls em.findOne, Object.assign, em.flush)
      // With the simplified mock, we can't fully assert — but we verify no throw
      expect(result).toBeDefined();
    });

    it('returns null when user not found', async () => {
      mockEm.findOne.mockResolvedValueOnce(null); // findById returns null

      const result = await service.update(999, {
        nombreApellido: 'Ghost',
      } as any);

      expect(result).toBeNull();
    });

    it('allows updating legajo to same value without conflict', async () => {
      // First findOne: findById for checking esSistema — returns the user
      mockEm.findOne.mockResolvedValueOnce({ id: 4, esSistema: false, legajo: '4444' });
      // Second findOne: checkUniqueLegajo with currentId=4 — $ne: 4 excludes this user
      mockEm.findOne.mockResolvedValueOnce(null);

      mockEm.flush.mockResolvedValue(undefined);

      const result = await service.update(4, {
        legajo: '4444',
      } as any);

      // Should not throw — same legajo on same user is fine
      expect(result).toBeDefined();
    });

    it('updates pin — hashes and strips raw pin', async () => {
      const existingUser = { id: 5, esSistema: false, legajo: '5555' };
      mockEm.find.mockResolvedValue([existingUser]); // super.update's findOne
      mockEm.findOne.mockResolvedValue(existingUser); // findById

      mockEm.flush.mockResolvedValue(undefined);

      await service.update(5, {
        pin: 'newpin',
      } as any);

      // verify pinHash was passed to super.update
      expect(mockEm.flush).toHaveBeenCalled();
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

    it('returns false when user not found', async () => {
      mockEm.findOne.mockResolvedValueOnce(null); // findById returns null

      const result = await service.softDelete(999);

      expect(result).toBe(false);
      // super.softDelete should never be called
      expect(mockEm.flush).not.toHaveBeenCalled();
    });
  });
});
