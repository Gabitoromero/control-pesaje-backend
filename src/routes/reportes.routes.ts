import { Router } from 'express';
import { getReportePasadasMuestras } from '../controllers/reporte.controller.js';
import { authenticateJWT } from '../middlewares/auth.middleware.js';

const router: Router = Router();

// Endpoint for report generation (needs auth)
// Not specifying roles but requires auth as per "Register GET /api/reportes/pasadas-muestras route with auth middleware"
router.get('/pasadas-muestras', authenticateJWT, getReportePasadasMuestras);

export default router;
