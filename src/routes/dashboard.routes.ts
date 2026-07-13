import { Router } from 'express';
import { authenticateJWT } from '../middlewares/auth.middleware.js';
import { getLineas, getResumen, getKpis, getEtapas } from '../controllers/dashboard.controller.js';

const router: Router = Router();

// Endpoint paths inside this router don't include /api/dashboard since it's mounted there
router.get('/lineas', authenticateJWT, getLineas);
router.get('/:lineaId/resumen', authenticateJWT, getResumen);
router.get('/:lineaId/kpis', authenticateJWT, getKpis);
router.get('/:lineaId/etapas', authenticateJWT, getEtapas);

export default router;
