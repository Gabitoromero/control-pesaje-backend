import { Router } from 'express';
import authRoutes from './auth.routes.js';
import usuariosRoutes from './usuarios.routes.js';
import articulosRoutes from './articulos.routes.js';
import etapasRoutes from './etapas.routes.js';
import lineasProduccionRoutes from './lineas-produccion.routes.js';
import rutasPasadasRoutes from './rutas-pasadas.routes.js';
import rutasPasadasEtapasRoutes from './rutas-pasadas-etapas.routes.js';
import rutasPasadasArticulosRoutes from './rutas-pasadas-articulos.routes.js';
import pasadasRoutes from './pasadas.routes.js';
import muestrasRoutes from './muestras.routes.js';

const router: Router = Router();

router.use('/auth', authRoutes);
router.use('/usuarios', usuariosRoutes);
router.use('/articulos', articulosRoutes);
router.use('/etapas', etapasRoutes);
router.use('/lineas-produccion', lineasProduccionRoutes);
router.use('/rutas-pasadas', rutasPasadasRoutes);
router.use('/rutas-pasadas-etapas', rutasPasadasEtapasRoutes);
router.use('/rutas-pasadas-articulos', rutasPasadasArticulosRoutes);
router.use('/pasadas', pasadasRoutes);
router.use('/muestras', muestrasRoutes);

export default router;
