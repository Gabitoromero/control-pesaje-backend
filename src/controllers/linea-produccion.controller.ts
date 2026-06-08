import type { RequestHandler } from 'express';
import { LineaProduccionService } from '../services/linea-produccion.service.js';
import { sesionService } from '../services/sesion.service.js';

export function createLineaProduccionHandlers(service: LineaProduccionService): { list: RequestHandler } {
  const list: RequestHandler = async (_req, res) => {
    try {
      const items = await service.findAll();
      const data = items.map(linea => {
        const sesion = sesionService.obtenerSesion(linea.id);
        return {
          id: linea.id,
          nombre: linea.nombre,
          numeroBalanza: linea.numeroBalanza,
          rutaPasadaActiva: linea.rutaPasadaActiva,
          activo: linea.activo,
          estado: sesion ? 'ocupada' : 'disponible',
        };
      });
      res.json({ success: true, data });
    } catch {
      res.status(500).json({ success: false, error: { message: 'Internal server error' } });
    }
  };

  return { list };
}
