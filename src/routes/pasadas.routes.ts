import { Router } from 'express';
import { validateBody } from '../middlewares/validation.middleware.js';
import { authenticateJWT, requireRoles } from '../middlewares/auth.middleware.js';
import { PasadaIniciarSchema, PasadaUpdateSchema } from '../shared/schemas.js';
import { PasadaService } from '../services/pasada.service.js';
import { createCrudHandlers } from '../controllers/base.controller.js';
import { createPasadaHandlers } from '../controllers/pasada.controller.js';
import { UsuarioRol } from '../shared/types.js';

const router: Router = Router();
const service = new PasadaService();

// Handlers from the custom factory (iniciar, list, getOne, update)
const { iniciar, list, getOne, update } = createPasadaHandlers(service);

// softDelete comes from the base CRUD factory (REQ-P5: JEFE/ADMIN only)
const { remove } = createCrudHandlers(service);

// Roles allowed to perform write operations (soft-delete, etc.)
const writeRoles = [UsuarioRol.ADMINISTRADOR, UsuarioRol.JEFE];

// All pasada-related roles (can iniciar, list, completar via update)
const operatorRoles = [UsuarioRol.ADMINISTRADOR, UsuarioRol.JEFE, UsuarioRol.OPERARIO];

// Apply JWT auth to all routes in this router (REQ-X1)
router.use(authenticateJWT);

router.get('/', list);
router.get('/inactive', createCrudHandlers(service).listInactive);
router.get('/:id', getOne);
router.post('/', requireRoles(operatorRoles), validateBody(PasadaIniciarSchema), iniciar);
router.put('/:id', requireRoles(operatorRoles), validateBody(PasadaUpdateSchema), update);
// DELETE requires JEFE or ADMIN role; ownership is not relevant for soft-delete (REQ-P5)
router.delete('/:id', requireRoles(writeRoles), remove);

export default router;
