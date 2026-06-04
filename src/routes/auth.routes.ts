import { Router } from 'express';
import { validateBody } from '../middlewares/validation.middleware.js';
import { authenticateJWT } from '../middlewares/auth.middleware.js';
import { login, verificarPin, activarSesion, cerrarSesion, getActiveSesion } from '../controllers/auth.controller.js';
import { LoginSchema, VerificarPinSchema, ActivarSesionSchema, CerrarSesionSchema } from '../utils/schemas.js';

const router: Router = Router();

router.post('/login', validateBody(LoginSchema), login);
router.post('/verificar-pin', authenticateJWT, validateBody(VerificarPinSchema), verificarPin);
router.post('/activar-sesion', authenticateJWT, validateBody(ActivarSesionSchema), activarSesion);
router.post('/cerrar-sesion', authenticateJWT, validateBody(CerrarSesionSchema), cerrarSesion);
router.get('/sesion-activa/:lineaId', authenticateJWT, getActiveSesion);

export default router;
