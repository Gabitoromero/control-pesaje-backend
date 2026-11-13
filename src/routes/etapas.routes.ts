import { Router } from 'express';
import { validateBody } from '../middlewares/validation.middleware.js';
import { authenticateJWT, requireRoles } from '../middlewares/auth.middleware.js';
import { EtapaCreateSchema, EtapaUpdateSchema } from '../utils/schemas.js';
import { EtapaService } from '../services/etapa.service.js';
import { createCrudHandlers } from '../controllers/base.controller.js';
import { createPaginatedListHandlers } from '../controllers/paginated-catalog.controller.js';
import { Etapa } from '../models/Etapa.js';
import { UsuarioRol } from '../shared/types.js';

const router: Router = Router();
const service = new EtapaService();
const { getOne, create, update, remove } = createCrudHandlers(service);

const { list, listInactive } = createPaginatedListHandlers({
  entityClass: Etapa,
  searchFields: ['nombre', 'descripcion'],
  sortFields: ['nombre'],
});

const writeRoles = [UsuarioRol.ADMINISTRADOR, UsuarioRol.JEFE];

router.use(authenticateJWT);

router.get('/', list);
router.get('/inactive', listInactive);
router.get('/:id', getOne);
router.post('/', requireRoles(writeRoles), validateBody(EtapaCreateSchema), create);
router.put('/:id', requireRoles(writeRoles), validateBody(EtapaUpdateSchema), update);
router.delete('/:id', requireRoles(writeRoles), remove);

export default router;
