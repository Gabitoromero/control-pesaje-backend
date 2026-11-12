import { Router } from 'express';
import { authenticateJWT, requireRoles } from '../middlewares/auth.middleware.js';
import { getHistorialCambios } from '../controllers/historial-cambio.controller.js';
import { UsuarioRol } from '../shared/types.js';

const router: Router = Router();

router.use(authenticateJWT);
router.get('/', requireRoles([UsuarioRol.ADMINISTRADOR, UsuarioRol.JEFE]), getHistorialCambios);

export default router;
