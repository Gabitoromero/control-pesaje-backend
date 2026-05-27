import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middlewares/validation.middleware.js';
import { login } from '../controllers/auth.controller.js';

const router: Router = Router();

const LoginSchema = z.object({
  nombreUsuario: z.string().min(1),
  contrasena: z.string().min(1),
});

router.post('/login', validateBody(LoginSchema), login);

export default router;
