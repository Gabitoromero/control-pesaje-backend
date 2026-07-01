import type { RequestHandler } from 'express';
import { LineaProduccionService } from '../services/linea-produccion.service.js';
import { sesionService } from '../services/sesion.service.js';

export function createLineaProduccionHandlers(service: LineaProduccionService): { list: RequestHandler } {
  const list: RequestHandler = async (req, res) => {
    try {
      const currentUser = (req as any).user;
      const items = await service.findAll();
      const data = items.map(linea => {
        const sesion = sesionService.obtenerSesion(linea.id);
        const ocupadaPorOtro = sesion && sesion.usuarioId !== null && sesion.usuarioId !== currentUser?.id;
        return {
          id: linea.id,
          nombre: linea.nombre,
          numeroBalanza: linea.numeroBalanza,
          rutaPasadaActiva: linea.rutaPasadaActiva,
          activo: linea.activo,
          estado: ocupadaPorOtro ? 'ocupada' : 'disponible',
        };
      });
      res.json({ success: true, data });
    } catch {
      res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
  };

  return { list };
}
