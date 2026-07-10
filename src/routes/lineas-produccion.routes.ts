import { Router } from 'express';
import { validateBody } from '../middlewares/validation.middleware.js';
import { authenticateJWT, requireRoles } from '../middlewares/auth.middleware.js';
import {
  LineaProduccionCreateSchema,
  LineaProduccionUpdateSchema,
  LineaProduccionDeviceSchema,
} from '../utils/schemas.js';
import { LineaProduccionService } from '../services/linea-produccion.service.js';
import { createCrudHandlers } from '../controllers/base.controller.js';
import { createLineaProduccionHandlers } from '../controllers/linea-produccion.controller.js';
import { UsuarioRol } from '../models/Usuario.js';

const router: Router = Router();
const service = new LineaProduccionService();
const { listInactive, getOne, create, update, remove } = createCrudHandlers(service);
const { list, assignDevice } = createLineaProduccionHandlers(service);

const writeRoles = [UsuarioRol.ADMINISTRADOR, UsuarioRol.JEFE];

router.use(authenticateJWT);

router.get('/', list);
router.get('/inactive', listInactive);
router.get('/:id', getOne);
router.post('/', requireRoles(writeRoles), validateBody(LineaProduccionCreateSchema), create);
router.put('/:id', requireRoles(writeRoles), validateBody(LineaProduccionUpdateSchema), update);
router.put('/:id/device', requireRoles(writeRoles), validateBody(LineaProduccionDeviceSchema), assignDevice);
router.delete('/:id', requireRoles(writeRoles), remove);

export default router;
