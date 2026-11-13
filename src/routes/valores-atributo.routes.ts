import { Router } from 'express';
import { validateBody } from '../middlewares/validation.middleware.js';
import { authenticateJWT, requireRoles } from '../middlewares/auth.middleware.js';
import { ValorAtributoRegistrarSchema } from '../shared/schemas.js';
import { ValorAtributoService } from '../services/valor-atributo.service.js';
import { createValorAtributoHandlers } from '../controllers/valor-atributo.controller.js';
import { UsuarioRol } from '../shared/types.js';

const router: Router = Router();
const { registrar, list } = createValorAtributoHandlers(new ValorAtributoService());

// Same roles as muestras: planta roles load values, visualizacion has no access.
const operatorRoles = [UsuarioRol.ADMINISTRADOR, UsuarioRol.JEFE, UsuarioRol.OPERARIO];

router.use(authenticateJWT);

// There is no PUT/DELETE: a loaded value cannot be corrected.
router.get('/', requireRoles(operatorRoles), list);
router.post('/', requireRoles(operatorRoles), validateBody(ValorAtributoRegistrarSchema), registrar);

export default router;
