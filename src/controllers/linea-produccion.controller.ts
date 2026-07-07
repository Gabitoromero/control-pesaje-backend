import type { RequestHandler } from 'express';
import { LineaProduccionService } from '../services/linea-produccion.service.js';
import { sesionService } from '../services/sesion.service.js';

export function createLineaProduccionHandlers(service: LineaProduccionService): { list: RequestHandler; assignDevice: RequestHandler } {
  const list: RequestHandler = async (req, res) => {
    try {
      const items = await service.findAll();
      const data = items.map(linea => {
        const sesion = sesionService.obtenerSesion(linea.id);
        const ocupada = sesion && sesion.usuarioId !== null;
        return {
          id: linea.id,
          nombre: linea.nombre,
          numeroBalanza: linea.numeroBalanza,
          rutaPasadaActiva: linea.rutaPasadaActiva,
          activo: linea.activo,
          estado: ocupada ? 'ocupada' : 'disponible',
        };
      });
      res.json({ success: true, data });
    } catch {
      res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
    }
  };

  const assignDevice: RequestHandler = async (req, res) => {
    try {
      if (typeof req.params.id !== 'string') {
        res.status(400).json({ success: false, error: { message: 'Invalid ID' } });
        return;
      }
      const id = parseInt(req.params.id, 10);
      const hardwareId = req.body.hardwareId;
      
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: { message: 'Invalid ID' } });
        return;
      }


      const updated = await service.assignDevice(id, hardwareId);
      if (!updated) {
        res.status(404).json({ success: false, error: { message: 'LineaProduccion not found' } });
        return;
      }
      res.json({ success: true, data: updated });
    } catch (err) {
      if (err instanceof Error && err.name === 'ValidationError') {
        res.status(400).json({ success: false, error: { message: err.message } });
        return;
      }
      res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
    }
  };

  return { list, assignDevice };
}
