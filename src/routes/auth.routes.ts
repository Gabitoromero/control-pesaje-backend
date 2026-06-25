import { Router } from 'express';
import { validateBody } from '../middlewares/validation.middleware.js';
import { authenticateJWT, requireRoles } from '../middlewares/auth.middleware.js';
import { login, sesionLinea, actividad, cerrarSesion, sesionActiva, todasSesionesActivas } from '../controllers/auth.controller.js';
import { LoginSchema, SesionLineaSchema, ActividadSchema, CerrarSesionSchema } from '../utils/schemas.js';
import { UsuarioRol } from '../models/Usuario.js';

const router: Router = Router();

router.post('/login', validateBody(LoginSchema), login);

router.post(
  '/sesion-linea',
  authenticateJWT,
  requireRoles([UsuarioRol.OPERARIO, UsuarioRol.JEFE, UsuarioRol.ADMINISTRADOR]),
  validateBody(SesionLineaSchema),
  sesionLinea
);

router.patch(
  '/actividad',
  authenticateJWT,
  validateBody(ActividadSchema),
  actividad
);

router.post(
  '/cerrar-sesion',
  authenticateJWT,
  validateBody(CerrarSesionSchema),
  cerrarSesion
);

router.get(
  '/sesion-activa/:lineaId',
  authenticateJWT,
  sesionActiva
);
router.get(
  '/sesiones-activas',
  authenticateJWT,
  requireRoles([UsuarioRol.ADMINISTRADOR]),
  todasSesionesActivas
);

export default router;
