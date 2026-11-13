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
import { createLineaProduccionHandlers, toLineaDto } from '../controllers/linea-produccion.controller.js';
import { createPaginatedListHandlers } from '../controllers/paginated-catalog.controller.js';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { LINEA_POPULATE } from '../services/linea-produccion.service.js';
import { UsuarioRol } from '../shared/types.js';

const router: Router = Router();
const service = new LineaProduccionService();
const { create, update, remove } = createCrudHandlers(service);
const { getOne, assignDevice } = createLineaProduccionHandlers(service);
const { list, listInactive } = createPaginatedListHandlers({
  entityClass: LineaProduccion,
  searchFields: ['nombre'],
  sortFields: ['nombre'],
  populate: LINEA_POPULATE,
  mapItem: toLineaDto,
});

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
