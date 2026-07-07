import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCrudHandlers } from './base.controller.js';
import type { BaseService } from '../services/base.service.js';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { RestrictError, ValidationError } from '../utils/errors.js';
import type { Request, Response } from 'express';

// ─── Stub entity ─────────────────────────────────────────────────────────────

interface StubEntity {
  id: number;
  activo: boolean;
  name: string;
}

// ─── Test setup ──────────────────────────────────────────────────────────────

describe('createCrudHandlers', () => {
  let mockService: BaseService<StubEntity>;
  let handlers: ReturnType<typeof createCrudHandlers<StubEntity>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockService = {
      findAll: vi.fn(),
      findAllInactive: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
    } as unknown as BaseService<StubEntity>;

    handlers = createCrudHandlers(mockService);
  });

  // ─── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns success with data from service.findAll', async () => {
      const items = [{ id: 1, activo: true, name: 'Item 1' }];
      vi.mocked(mockService.findAll).mockResolvedValue(items as StubEntity[]);

      const req = {} as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.list(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, data: items });
    });

    it('returns 500 when service.findAll throws', async () => {
      vi.mocked(mockService.findAll).mockRejectedValue(new Error('DB error'));

      const req = {} as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.list(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: { message: 'Error interno del servidor' } });
    });
  });

  // ─── listInactive ──────────────────────────────────────────────────────────

  describe('listInactive', () => {
    it('returns success with data from service.findAllInactive', async () => {
      const items = [{ id: 2, activo: false, name: 'Inactive Item' }];
      vi.mocked(mockService.findAllInactive).mockResolvedValue(items as StubEntity[]);

      const req = {} as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.listInactive(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, data: items });
    });

    it('returns 500 when service.findAllInactive throws', async () => {
      vi.mocked(mockService.findAllInactive).mockRejectedValue(new Error('DB error'));

      const req = {} as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.listInactive(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: { message: 'Error interno del servidor' } });
    });
  });

  // ─── getOne ────────────────────────────────────────────────────────────────

  describe('getOne', () => {
    it('returns success with the found entity', async () => {
      const item = { id: 1, activo: true, name: 'Found' };
      vi.mocked(mockService.findById).mockResolvedValue(item as StubEntity);

      const req = { params: { id: '1' } } as unknown as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.getOne(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, data: item });
    });

    it('returns 404 when entity not found', async () => {
      vi.mocked(mockService.findById).mockResolvedValue(null);

      const req = { params: { id: '999' } } as unknown as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.getOne(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: { message: 'Registro no encontrado' } });
    });

    it('returns 500 when service.findById throws', async () => {
      vi.mocked(mockService.findById).mockRejectedValue(new Error('DB error'));

      const req = { params: { id: '1' } } as unknown as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.getOne(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: { message: 'Error interno del servidor' } });
    });
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('returns 201 with created entity', async () => {
      const created = { id: 10, activo: true, name: 'New' };
      vi.mocked(mockService.create).mockResolvedValue(created as StubEntity);

      const req = { body: { name: 'New' } } as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.create(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: created });
    });

    it('returns 400 when UniqueConstraintViolationException is thrown', async () => {
      vi.mocked(mockService.create).mockRejectedValue(new UniqueConstraintViolationException(new Error('duplicate')));

      const req = { body: { name: 'Dup' } } as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.create(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: { message: 'Ya existe un registro con ese valor' } });
    });

    it('returns 400 when ValidationError is thrown', async () => {
      vi.mocked(mockService.create).mockRejectedValue(new ValidationError('Campo inválido'));

      const req = { body: { name: 'Bad' } } as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.create(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: { message: 'Campo inválido' } });
    });

    it('returns 500 on unexpected error', async () => {
      vi.mocked(mockService.create).mockRejectedValue(new Error('Unexpected'));

      const req = { body: { name: 'x' } } as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.create(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: { message: 'Error interno del servidor' } });
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('returns updated entity on success', async () => {
      const updated = { id: 1, activo: true, name: 'Updated' };
      vi.mocked(mockService.update).mockResolvedValue(updated as StubEntity);

      const req = { params: { id: '1' }, body: { name: 'Updated' } } as unknown as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.update(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, data: updated });
    });

    it('returns 404 when entity not found', async () => {
      vi.mocked(mockService.update).mockResolvedValue(null);

      const req = { params: { id: '999' }, body: { name: 'x' } } as unknown as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.update(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: { message: 'Registro no encontrado' } });
    });

    it('returns 400 when UniqueConstraintViolationException is thrown', async () => {
      vi.mocked(mockService.update).mockRejectedValue(new UniqueConstraintViolationException(new Error('duplicate')));

      const req = { params: { id: '1' }, body: { name: 'Dup' } } as unknown as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.update(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: { message: 'Ya existe un registro con ese valor' } });
    });

    it('returns 400 when ValidationError is thrown', async () => {
      vi.mocked(mockService.update).mockRejectedValue(new ValidationError('No válido'));

      const req = { params: { id: '1' }, body: { name: 'Bad' } } as unknown as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.update(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: { message: 'No válido' } });
    });

    it('returns 500 on unexpected error', async () => {
      vi.mocked(mockService.update).mockRejectedValue(new Error('Unexpected'));

      const req = { params: { id: '1' }, body: { name: 'x' } } as unknown as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.update(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: { message: 'Error interno del servidor' } });
    });
  });

  // ─── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('returns success with deleted id on soft delete', async () => {
      vi.mocked(mockService.softDelete).mockResolvedValue(true);

      const req = { params: { id: '1' } } as unknown as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.remove(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 1 } });
    });

    it('returns 404 when entity not found', async () => {
      vi.mocked(mockService.softDelete).mockResolvedValue(false);

      const req = { params: { id: '999' } } as unknown as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.remove(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: { message: 'Registro no encontrado' } });
    });

    it('returns 400 when RestrictError is thrown', async () => {
      vi.mocked(mockService.softDelete).mockRejectedValue(new RestrictError('Cannot delete — has active references'));

      const req = { params: { id: '1' } } as unknown as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.remove(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: { message: 'Cannot delete — has active references' } });
    });

    it('returns 400 when ValidationError is thrown', async () => {
      vi.mocked(mockService.softDelete).mockRejectedValue(new ValidationError('No se puede borrar'));

      const req = { params: { id: '1' } } as unknown as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.remove(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: { message: 'No se puede borrar' } });
    });

    it('returns 500 on unexpected error', async () => {
      vi.mocked(mockService.softDelete).mockRejectedValue(new Error('Unexpected'));

      const req = { params: { id: '1' } } as unknown as Request;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as unknown as Response;

      await handlers.remove(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: { message: 'Error interno del servidor' } });
    });
  });
});
