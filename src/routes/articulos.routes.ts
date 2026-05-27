import { Router } from 'express';
import { validateBody } from '../middlewares/validation.middleware.js';
import { authenticateJWT, requireRoles } from '../middlewares/auth.middleware.js';
import { ArticuloCreateSchema, ArticuloUpdateSchema } from '../utils/schemas.js';
import { ArticuloService } from '../services/articulo.service.js';
import { createCrudHandlers } from '../controllers/base.controller.js';
import { UsuarioRol } from '../models/Usuario.js';

const router: Router = Router();
const service = new ArticuloService();
const { list, getOne, create, update, remove } = createCrudHandlers(service);

const writeRoles = [UsuarioRol.ADMINISTRADOR, UsuarioRol.JEFE];

router.use(authenticateJWT);

router.get('/', list);
router.get('/:id', getOne);
router.post('/', requireRoles(writeRoles), validateBody(ArticuloCreateSchema), create);
router.put('/:id', requireRoles(writeRoles), validateBody(ArticuloUpdateSchema), update);
router.delete('/:id', requireRoles(writeRoles), remove);

export default router;
