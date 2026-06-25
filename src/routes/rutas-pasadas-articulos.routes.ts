import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { validateBody } from '../middlewares/validation.middleware.js';
import { authenticateJWT, requireRoles } from '../middlewares/auth.middleware.js';
import { ArticuloRutaPasadaCreateSchema } from '../shared/schemas.js';
import { ArticuloRutaPasadaService } from '../services/articulo-ruta-pasada.service.js';
import { UsuarioRol } from '../models/Usuario.js';

const router: Router = Router();
const service = new ArticuloRutaPasadaService();

const writeRoles = [UsuarioRol.ADMINISTRADOR, UsuarioRol.JEFE];

const RutaPasadaIdQuerySchema = z.coerce.number().int().positive().optional();

// ─── Local thin handlers ──────────────────────────────────────────────────────
// These do not use createCrudHandlers because that factory requires
// T extends { id; activo }, but ArticuloRutaPasada has no activo field.

const list: RequestHandler = async (req, res) => {
  const parsed = RutaPasadaIdQuerySchema.safeParse(req.query.rutaPasadaId);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { message: 'Invalid rutaPasadaId' } });
    return;
  }
  try {
    const items = await service.findAll(parsed.data);
    res.json({ success: true, data: items });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

const getOne: RequestHandler = async (req, res) => {
  const id = Number(req.params.id);
  try {
    const item = await service.findOne(id);
    if (!item) {
      res.status(404).json({ success: false, error: { message: 'Not found' } });
      return;
    }
    res.json({ success: true, data: item });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

const create: RequestHandler = async (req, res) => {
  try {
    const entity = await service.create(req.body);
    res.status(201).json({ success: true, data: entity });
  } catch (err) {
    if (err instanceof UniqueConstraintViolationException) {
      res.status(400).json({ success: false, error: { message: 'A record with that value already exists' } });
      return;
    }
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

const remove: RequestHandler = async (req, res) => {
  const id = Number(req.params.id);
  try {
    const deleted = await service.remove(id);
    if (!deleted) {
      res.status(404).json({ success: false, error: { message: 'Not found' } });
      return;
    }
    res.json({ success: true, data: { id } });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

// ─── Routes ──────────────────────────────────────────────────────────────────

router.use(authenticateJWT);

router.get('/', list);
router.get('/:id', getOne);
router.post('/', requireRoles(writeRoles), validateBody(ArticuloRutaPasadaCreateSchema), create);
router.delete('/:id', requireRoles(writeRoles), remove);

// NOTE: /inactive and PUT /:id are intentionally NOT registered.
// ArticuloRutaPasada has no activo field (hard-delete only) and updates
// are managed through the parent RutaPasada update endpoint.

export default router;
