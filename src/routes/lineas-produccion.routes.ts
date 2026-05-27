import { Router } from 'express';
import { validateBody } from '../middlewares/validation.middleware.js';
import { authenticateJWT, requireRoles } from '../middlewares/auth.middleware.js';
import { LineaProduccionCreateSchema, LineaProduccionUpdateSchema } from '../utils/schemas.js';
import { LineaProduccionService } from '../services/linea-produccion.service.js';
import { createCrudHandlers } from '../controllers/base.controller.js';
import { UsuarioRol } from '../models/Usuario.js';

const router: Router = Router();
const service = new LineaProduccionService();
const { list, getOne, create, update, remove } = createCrudHandlers(service);

const writeRoles = [UsuarioRol.ADMINISTRADOR, UsuarioRol.JEFE];

router.use(authenticateJWT);

router.get('/', list);
router.get('/:id', getOne);
router.post('/', requireRoles(writeRoles), validateBody(LineaProduccionCreateSchema), create);
router.put('/:id', requireRoles(writeRoles), validateBody(LineaProduccionUpdateSchema), update);
router.delete('/:id', requireRoles(writeRoles), remove);

export default router;
