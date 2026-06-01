import { Router } from 'express';
import { validateBody } from '../middlewares/validation.middleware.js';
import { authenticateJWT } from '../middlewares/auth.middleware.js';
import { login, activateOperatorSession, closeOperatorSession, getSesionActiva } from '../controllers/auth.controller.js';
import { LoginSchema, ActivarSesionSchema, CerrarSesionOperarioSchema } from '../utils/schemas.js';

const router: Router = Router();

router.post('/login', validateBody(LoginSchema), login);
router.post('/activar-sesion-operario', authenticateJWT, validateBody(ActivarSesionSchema), activateOperatorSession);
router.post('/cerrar-sesion-operario', authenticateJWT, validateBody(CerrarSesionOperarioSchema), closeOperatorSession);
router.get('/sesion-activa/:lineaId', authenticateJWT, getSesionActiva);

export default router;
