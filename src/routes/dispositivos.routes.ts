import { Router } from 'express';
import { getDispositivosConectados } from '../controllers/dispositivos.controller.js';
import { authenticateJWT, requireRoles } from '../middlewares/auth.middleware.js';
import { UsuarioRol } from '../models/Usuario.js';

const router: Router = Router();

router.get(
  '/conectados',
  authenticateJWT,
  requireRoles([UsuarioRol.ADMINISTRADOR]),
  getDispositivosConectados
);

export default router;
