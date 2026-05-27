import { Router } from 'express';
import { validateBody } from '../middlewares/validation.middleware.js';
import { authenticateJWT, requireRoles } from '../middlewares/auth.middleware.js';
import { UsuarioCreateSchema, UsuarioUpdateSchema } from '../utils/schemas.js';
import { UsuarioService } from '../services/usuario.service.js';
import { createCrudHandlers } from '../controllers/base.controller.js';
import { UsuarioRol } from '../models/Usuario.js';

const router: Router = Router();
const service = new UsuarioService();
const { list, getOne, create, update, remove } = createCrudHandlers(service);

const writeRoles = [UsuarioRol.ADMINISTRADOR];

router.use(authenticateJWT);

router.get('/', list);
router.get('/:id', getOne);
router.post('/', requireRoles(writeRoles), validateBody(UsuarioCreateSchema), create);
router.put('/:id', requireRoles(writeRoles), validateBody(UsuarioUpdateSchema), update);
router.delete('/:id', requireRoles(writeRoles), remove);

export default router;
