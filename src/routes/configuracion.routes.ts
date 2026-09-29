import { Router } from 'express';
import { getToleranciaConfig, updateToleranciaConfig } from '../controllers/configuracion.controller.js';
import { authenticateJWT, requireRoles } from '../middlewares/auth.middleware.js';
import { validateBody } from '../middlewares/validation.middleware.js';
import { UsuarioRol } from '../models/Usuario.js';
import { ToleranciaConfigUpdateSchema } from '../shared/schemas.js';

const router: Router = Router();

// Any authenticated user (tablets carry a JWT) can read the tolerance.
router.get('/tolerancia', authenticateJWT, getToleranciaConfig);

// Admin-only. Order guarantees 401 (no token) -> 403 (wrong role) -> 400 (invalid body).
router.put(
  '/tolerancia',
  authenticateJWT,
  requireRoles([UsuarioRol.ADMINISTRADOR]),
  validateBody(ToleranciaConfigUpdateSchema),
  updateToleranciaConfig
);

export default router;
