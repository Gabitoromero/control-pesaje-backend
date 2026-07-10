import type { RequestHandler } from 'express';
import { RequestContext, UniqueConstraintViolationException } from '@mikro-orm/core';
import { LineaProduccionService } from '../services/linea-produccion.service.js';
import { sesionService } from '../services/sesion.service.js';
import { assignHardwareIdToLinea } from '../services/device-pairing.service.js';

export function createLineaProduccionHandlers(
  service: LineaProduccionService
): { list: RequestHandler; assignDevice: RequestHandler } {
  const list: RequestHandler = async (req, res) => {
    try {
      const currentUser = req.user;
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
    const id = Number(req.params.id);
    const { hardwareId } = req.body as { hardwareId: string };
    try {
      const em = RequestContext.getEntityManager()!;
      const linea = await assignHardwareIdToLinea(em, id, hardwareId);
      if (!linea) {
        res.status(404).json({ success: false, error: { message: 'Registro no encontrado' } });
        return;
      }
      res.json({ success: true, data: linea });
    } catch (err) {
      if (err instanceof UniqueConstraintViolationException) {
        res.status(400).json({ success: false, error: { message: 'Ya existe un registro con ese valor' } });
        return;
      }
      console.error('[assignDevice error]', err);
      res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
    }
  };

  return { list, assignDevice };
}
