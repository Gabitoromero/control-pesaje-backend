import { Router } from 'express';
import { validateBody } from '../middlewares/validation.middleware.js';
import { authenticateJWT, requireRoles } from '../middlewares/auth.middleware.js';
import { LineaProduccionCreateSchema, LineaProduccionUpdateSchema } from '../utils/schemas.js';
import { LineaProduccionService } from '../services/linea-produccion.service.js';
import { createCrudHandlers } from '../controllers/base.controller.js';
import { UsuarioRol } from '../models/Usuario.js';

import { sesionService } from '../services/sesion.service.js';

const router: Router = Router();
const service = new LineaProduccionService();
const { getOne, create, update, remove } = createCrudHandlers(service);

const writeRoles = [UsuarioRol.ADMINISTRADOR, UsuarioRol.JEFE];

router.use(authenticateJWT);

router.get('/', async (_req, res) => {
  try {
    const items = await service.findAll();
    const data = items.map(linea => {
      const sesion = sesionService.obtenerSesion(linea.id);
      return {
        id: linea.id,
        nombre: linea.nombre,
        numeroBalanza: linea.numeroBalanza,
        rutaPasadaActiva: linea.rutaPasadaActiva,
        activo: linea.activo,
        estado: sesion ? 'ocupada' : 'disponible'
      };
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
});
router.get('/:id', getOne);
router.post('/', requireRoles(writeRoles), validateBody(LineaProduccionCreateSchema), create);
router.put('/:id', requireRoles(writeRoles), validateBody(LineaProduccionUpdateSchema), update);
router.delete('/:id', requireRoles(writeRoles), remove);

export default router;
