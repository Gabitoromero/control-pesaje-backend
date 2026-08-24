import { Router } from 'express';
import { getDispositivosConectados, deleteDispositivo, createDispositivo, updateDispositivo, updateDispositivoUnidad } from '../controllers/dispositivos.controller.js';
import { authenticateJWT, requireRoles } from '../middlewares/auth.middleware.js';
import { UsuarioRol } from '../models/Usuario.js';

const router: Router = Router();

router.get(
  '/conectados',
  authenticateJWT,
  requireRoles([UsuarioRol.ADMINISTRADOR, UsuarioRol.JEFE]),
  getDispositivosConectados
);

router.post(
  '/',
  authenticateJWT,
  requireRoles([UsuarioRol.ADMINISTRADOR, UsuarioRol.JEFE]),
  createDispositivo
);

router.put(
  '/:id',
  authenticateJWT,
  requireRoles([UsuarioRol.ADMINISTRADOR, UsuarioRol.JEFE]),
  updateDispositivo
);

// Wider role set than PUT /:id (admin/jefe device administration): a live
// unidad correction is a tablet-triggered operator action, mirroring the
// operatorRoles pattern in muestras.routes.ts (sdd/unidad-medida-peso Part B,
// decision B4). OPERARIO inclusion is a confirmed product decision.
router.patch(
  '/:id/unidad',
  authenticateJWT,
  requireRoles([UsuarioRol.ADMINISTRADOR, UsuarioRol.JEFE, UsuarioRol.OPERARIO]),
  updateDispositivoUnidad
);

// Jefe/Administrador (not admin-only): decommissioning hardware is an
// operational task the Jefe de Planta also needs to perform.
router.delete(
  '/:id',
  authenticateJWT,
  requireRoles([UsuarioRol.ADMINISTRADOR, UsuarioRol.JEFE]),
  deleteDispositivo
);

export default router;
