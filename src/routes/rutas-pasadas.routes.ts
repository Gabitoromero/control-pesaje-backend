import { Router } from 'express';
import { validateBody } from '../middlewares/validation.middleware.js';
import { authenticateJWT, requireRoles } from '../middlewares/auth.middleware.js';
import { RutaPasadaCreateSchema, RutaPasadaUpdateSchema } from '../shared/schemas.js';
import { RutaPasadaService } from '../services/ruta-pasada.service.js';
import { createCrudHandlers } from '../controllers/base.controller.js';
import { UsuarioRol } from '../models/Usuario.js';

const router: Router = Router();
const service = new RutaPasadaService();
const { list, listInactive, getOne, create, update, remove } = createCrudHandlers(service);

const writeRoles = [UsuarioRol.ADMINISTRADOR, UsuarioRol.JEFE];

router.use(authenticateJWT);

router.get('/', list);
router.get('/inactive', listInactive);
router.get('/:id', getOne);
router.post('/', requireRoles(writeRoles), validateBody(RutaPasadaCreateSchema), create);
router.put('/:id', requireRoles(writeRoles), validateBody(RutaPasadaUpdateSchema), update);
router.delete('/:id', requireRoles(writeRoles), remove);

export default router;
