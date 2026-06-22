import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validateBody } from '../middlewares/validation.middleware.js';
import { authenticateJWT, requireRoles } from '../middlewares/auth.middleware.js';
import { RutaPasadaEtapaCreateSchema, RutaPasadaEtapaUpdateSchema } from '../shared/schemas.js';
import { RutaPasadaEtapaService } from '../services/ruta-pasada-etapa.service.js';
import { createCrudHandlers } from '../controllers/base.controller.js';
import { UsuarioRol } from '../models/Usuario.js';

const router: Router = Router();
const service = new RutaPasadaEtapaService();
const { listInactive, getOne, create, update, remove } = createCrudHandlers(service);

const writeRoles = [UsuarioRol.ADMINISTRADOR, UsuarioRol.JEFE];

const RutaPasadaIdQuerySchema = z.coerce.number().int().positive().optional();

const list: RequestHandler = async (req, res) => {
  const parsed = RutaPasadaIdQuerySchema.safeParse(req.query.rutaPasadaId);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { message: 'Invalid rutaPasadaId' } });
    return;
  }
  try {
    const items = await service.findAll(parsed.data);
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

router.use(authenticateJWT);

router.get('/', list);
router.get('/inactive', listInactive);
router.get('/:id', getOne);
router.post('/', requireRoles(writeRoles), validateBody(RutaPasadaEtapaCreateSchema), create);
router.put('/:id', requireRoles(writeRoles), validateBody(RutaPasadaEtapaUpdateSchema), update);
router.delete('/:id', requireRoles(writeRoles), remove);

export default router;
