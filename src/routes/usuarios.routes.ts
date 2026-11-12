import { Router } from 'express';
import { validateBody } from '../middlewares/validation.middleware.js';
import { authenticateJWT, requireRoles } from '../middlewares/auth.middleware.js';
import { UsuarioCreateSchema, UsuarioUpdateSchema } from '../utils/schemas.js';
import { UsuarioService } from '../services/usuario.service.js';
import { createCrudHandlers } from '../controllers/base.controller.js';
import { z } from 'zod';
import { containsText, createPaginatedListHandlers } from '../controllers/paginated-catalog.controller.js';
import { Usuario } from '../models/Usuario.js';
import { SectorUsuario, UsuarioRol } from '../shared/types.js';

const router: Router = Router();
const service = new UsuarioService();
const { getOne, create, update, remove } = createCrudHandlers(service);

const SIN_SECTOR = 'sin-sector';
const SECTOR_CODES = Object.values(SectorUsuario);

const { list, listInactive } = createPaginatedListHandlers({
  entityClass: Usuario,
  searchFields: ['nombreApellido', 'nombreUsuario', 'legajo', 'rol'],
  sortFields: ['nombreApellido', 'nombreUsuario', 'legajo'],
  // `rol` is a native enum column: match the enum values instead of casting it to text.
  searchCondition: (field, text) =>
    field === 'rol'
      ? { rol: { $in: Object.values(UsuarioRol).filter((rol) => rol.includes(text.toLowerCase())) } }
      : containsText(field, text),
  extraQuery: { sector: z.enum([...SECTOR_CODES, SIN_SECTOR]).optional() },
  // Any code that is not a known sector counts as "Sin sector", as the table shows it.
  extraFilter: ({ sector }) => {
    if (sector === undefined) return undefined;
    if (sector !== SIN_SECTOR) return { datosAdicionales: { sector } };
    return {
      $or: [
        { datosAdicionales: null },
        { datosAdicionales: { sector: null } },
        { datosAdicionales: { sector: { $nin: SECTOR_CODES } } },
      ],
    };
  },
});

const writeRoles = [UsuarioRol.ADMINISTRADOR];

router.use(authenticateJWT);

router.get('/', list);
router.get('/inactive', listInactive);
router.get('/:id', getOne);
router.post('/', requireRoles(writeRoles), validateBody(UsuarioCreateSchema), create);
router.put('/:id', requireRoles(writeRoles), validateBody(UsuarioUpdateSchema), update);
router.delete('/:id', requireRoles(writeRoles), remove);

export default router;
