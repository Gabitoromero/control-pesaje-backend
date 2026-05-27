import type { RequestHandler } from 'express';
import { BaseService } from '../services/base.service.js';
import { RestrictError } from '../utils/errors.js';

export interface CrudHandlers {
  list: RequestHandler;
  getOne: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  remove: RequestHandler;
}

/**
 * Factory that creates standard CRUD handlers for an entity service.
 * Keeps controllers thin — all logic lives in services.
 */
export function createCrudHandlers<T extends { id: number; activo: boolean }>(
  service: BaseService<T>,
): CrudHandlers {
  const list: RequestHandler = async (_req, res) => {
    try {
      const items = await service.findAll();
      res.json({ success: true, data: items });
    } catch (err) {
      res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
  };

  const getOne: RequestHandler = async (req, res) => {
    const id = Number(req.params.id);
    try {
      const item = await service.findById(id);
      if (!item) {
        res.status(404).json({ success: false, error: { message: 'Not found' } });
        return;
      }
      res.json({ success: true, data: item });
    } catch (err) {
      res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
  };

  const create: RequestHandler = async (req, res) => {
    try {
      const entity = await service.create(req.body);
      res.status(201).json({ success: true, data: entity });
    } catch (err) {
      res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
  };

  const update: RequestHandler = async (req, res) => {
    const id = Number(req.params.id);
    try {
      const entity = await service.update(id, req.body);
      if (!entity) {
        res.status(404).json({ success: false, error: { message: 'Not found' } });
        return;
      }
      res.json({ success: true, data: entity });
    } catch (err) {
      res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
  };

  const remove: RequestHandler = async (req, res) => {
    const id = Number(req.params.id);
    try {
      const deleted = await service.softDelete(id);
      if (!deleted) {
        res.status(404).json({ success: false, error: { message: 'Not found' } });
        return;
      }
      res.json({ success: true, data: { id } });
    } catch (err) {
      if (err instanceof RestrictError) {
        res.status(400).json({ success: false, error: { message: err.message } });
        return;
      }
      res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
  };

  return { list, getOne, create, update, remove };
}
