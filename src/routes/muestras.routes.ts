import { Router } from 'express';
import { validateBody } from '../middlewares/validation.middleware.js';
import { authenticateJWT, requireRoles } from '../middlewares/auth.middleware.js';
import { MuestraRegistrarSchema, MuestraUpdateSchema } from '../shared/schemas.js';
import { MuestraService } from '../services/muestra.service.js';
import { createCrudHandlers } from '../controllers/base.controller.js';
import { createMuestraHandlers } from '../controllers/muestra.controller.js';
import { UsuarioRol } from '../shared/types.js';

const router: Router = Router();
const service = new MuestraService();

// Handlers from the custom factory (registrar, list, getOne, update, hardDelete)
const { registrar, list, getOne, update, hardDelete } = createMuestraHandlers(service);

// No listInactive since Muestra is hard-delete only
// All standard roles can access muestras (ownership/role checks are inside handlers)
const operatorRoles = [UsuarioRol.ADMINISTRADOR, UsuarioRol.JEFE, UsuarioRol.OPERARIO];

// Apply JWT auth to all routes in this router (REQ-X1)
router.use(authenticateJWT);

router.get('/', list);
router.get('/:id', getOne);
router.post('/', requireRoles(operatorRoles), validateBody(MuestraRegistrarSchema), registrar);
router.put('/:id', requireRoles(operatorRoles), validateBody(MuestraUpdateSchema), update);
// DELETE: ownership/role check is inside hardDelete handler (not at route level per design)
router.delete('/:id', requireRoles(operatorRoles), hardDelete);

export default router;
