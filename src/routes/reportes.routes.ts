import { Router } from 'express';
import { getReporteMuestras, getReportePasadas, getReporteRutasPasada } from '../controllers/reporte.controller.js';
import { authenticateJWT } from '../middlewares/auth.middleware.js';

const router: Router = Router();

// Report endpoints (need auth, no specific roles). muestras and pasadas share the desde/hasta query params.
router.get('/muestras', authenticateJWT, getReporteMuestras);
router.get('/pasadas', authenticateJWT, getReportePasadas);
router.get('/rutas-pasada', authenticateJWT, getReporteRutasPasada);

export default router;
