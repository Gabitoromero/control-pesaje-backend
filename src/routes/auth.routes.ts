import { Router } from 'express';
import { validateBody } from '../middlewares/validation.middleware.js';
import { authenticateJWT } from '../middlewares/auth.middleware.js';
import { login, activateOperatorSesion, closeOperatorSesion, getActiveSesion } from '../controllers/auth.controller.js';
import { LoginSchema, ActivarSesionSchema, CerrarSesionOperarioSchema } from '../utils/schemas.js';

const router: Router = Router();

router.post('/login', validateBody(LoginSchema), login);
router.post('/activar-sesion-operario', authenticateJWT, validateBody(ActivarSesionSchema), activateOperatorSesion);
router.post('/cerrar-sesion-operario', authenticateJWT, validateBody(CerrarSesionOperarioSchema), closeOperatorSesion);
router.get('/sesion-activa/:lineaId', authenticateJWT, getActiveSesion);

export default router;
