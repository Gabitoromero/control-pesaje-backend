import { Router } from 'express';
import { getDispositivosConectados, deleteDispositivo, createDispositivo, updateDispositivo } from '../controllers/dispositivos.controller.js';
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

// Jefe/Administrador (not admin-only): decommissioning hardware is an
// operational task the Jefe de Planta also needs to perform.
router.delete(
  '/:id',
  authenticateJWT,
  requireRoles([UsuarioRol.ADMINISTRADOR, UsuarioRol.JEFE]),
  deleteDispositivo
);

export default router;
