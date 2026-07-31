import { Router } from 'express';
import { validateBody } from '../middlewares/validation.middleware.js';
import { authenticateJWT, requireRoles } from '../middlewares/auth.middleware.js';
import { BalanzaCreateSchema, BalanzaUpdateSchema } from '../shared/schemas.js';
import { BalanzaService } from '../services/balanza.service.js';
import { createCrudHandlers } from '../controllers/base.controller.js';
import { UsuarioRol } from '../models/Usuario.js';

const router: Router = Router();
const service = new BalanzaService();
const { list, listInactive, getOne, create, update, remove } = createCrudHandlers(service);

const writeRoles = [UsuarioRol.ADMINISTRADOR, UsuarioRol.JEFE];

router.use(authenticateJWT);

router.get('/', list);
router.get('/inactive', listInactive);
router.get('/:id', getOne);
router.post('/', requireRoles(writeRoles), validateBody(BalanzaCreateSchema), create);
router.put('/:id', requireRoles(writeRoles), validateBody(BalanzaUpdateSchema), update);
router.delete('/:id', requireRoles(writeRoles), remove);

export default router;
