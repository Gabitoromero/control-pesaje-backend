import type { RequestHandler } from 'express';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { BaseService } from '../services/base.service.js';
import { RestrictError, ValidationError } from '../utils/errors.js';

export interface CrudHandlers {
  list: RequestHandler;
  listInactive: RequestHandler;
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
      res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
    }
  };

  const listInactive: RequestHandler = async (_req, res) => {
    try {
      const items = await service.findAllInactive();
      res.json({ success: true, data: items });
    } catch (err) {
      res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
    }
  };

  const getOne: RequestHandler = async (req, res) => {
    const id = Number(req.params.id);
    try {
      const item = await service.findById(id);
      if (!item) {
        res.status(404).json({ success: false, error: { message: 'Registro no encontrado' } });
        return;
      }
      res.json({ success: true, data: item });
    } catch (err) {
      res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
    }
  };

  const create: RequestHandler = async (req, res) => {
    try {
      const entity = await service.create(req.body);
      res.status(201).json({ success: true, data: entity });
    } catch (err) {
      if (err instanceof UniqueConstraintViolationException) {
        res.status(400).json({ success: false, error: { message: 'Ya existe un registro con ese valor' } });
        return;
      }
      if (err instanceof ValidationError) {
        res.status(400).json({ success: false, error: { message: err.message } });
        return;
      }
      res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
    }
  };

  const update: RequestHandler = async (req, res) => {
    const id = Number(req.params.id);
    try {
      const entity = await service.update(id, req.body);
      if (!entity) {
        res.status(404).json({ success: false, error: { message: 'Registro no encontrado' } });
        return;
      }
      res.json({ success: true, data: entity });
    } catch (err) {
      if (err instanceof UniqueConstraintViolationException) {
        res.status(400).json({ success: false, error: { message: 'Ya existe un registro con ese valor' } });
        return;
      }
      if (err instanceof ValidationError) {
        res.status(400).json({ success: false, error: { message: err.message } });
        return;
      }
      console.error('[update error]', err);
      res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
    }
  };

  const remove: RequestHandler = async (req, res) => {
    const id = Number(req.params.id);
    try {
      const deleted = await service.softDelete(id);
      if (!deleted) {
        res.status(404).json({ success: false, error: { message: 'Registro no encontrado' } });
        return;
      }
      res.json({ success: true, data: { id } });
    } catch (err) {
      if (err instanceof RestrictError) {
        res.status(400).json({ success: false, error: { message: err.message } });
        return;
      }
      if (err instanceof ValidationError) {
        res.status(400).json({ success: false, error: { message: err.message } });
        return;
      }
      res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
    }
  };

  return { list, listInactive, getOne, create, update, remove };
}
