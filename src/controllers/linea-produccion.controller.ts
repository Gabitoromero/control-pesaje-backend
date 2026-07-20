import type { RequestHandler } from 'express';
import { RequestContext, UniqueConstraintViolationException } from '@mikro-orm/core';
import { LineaProduccionService } from '../services/linea-produccion.service.js';
import { sesionService } from '../services/sesion.service.js';
import { assignHardwareIdToLinea, unassignDeviceFromLinea } from '../services/device-pairing.service.js';
import { disconnectDeviceByHardwareId } from '../socket/device-pairing.handler.js';
import { getIo } from '../socket/index.js';
import { LineaProduccionDeviceSchema } from '../shared/schemas.js';
import { Dispositivo } from '../models/Dispositivo.js';
import { LineaProduccion } from '../models/LineaProduccion.js';

export interface DispositivoDto {
  hardwareId: string;
  nombre: string;
  ultimaConexionAt: Date | null;
}

/**
 * Shared projection for the assigned-device shape across every línea
 * endpoint (list/listInactive/getOne/assignDevice). MUST be null (never
 * undefined) when unassigned — see spec "Consistent dispositivo Projection".
 */
export function toDispositivoDto(dispositivo?: Dispositivo | null): DispositivoDto | null {
  if (!dispositivo) return null;
  return {
    hardwareId: dispositivo.hardwareId,
    nombre: dispositivo.nombre,
    ultimaConexionAt: dispositivo.ultimaConexionAt ?? null,
  };
}

function toLineaDto(linea: LineaProduccion) {
  const sesion = sesionService.obtenerSesion(linea.id);
  const ocupada = sesion && sesion.usuarioId !== null;
  return {
    id: linea.id,
    nombre: linea.nombre,
    rutaPasadaActiva: linea.rutaPasadaActiva,
    activo: linea.activo,
    estado: ocupada ? 'ocupada' : 'disponible',
    dispositivo: toDispositivoDto(linea.dispositivo),
  };
}

export function createLineaProduccionHandlers(
  service: LineaProduccionService
): { list: RequestHandler; listInactive: RequestHandler; getOne: RequestHandler; assignDevice: RequestHandler } {
  const list: RequestHandler = async (_req, res) => {
    try {
      const items = await service.findAll();
      const data = items.map(toLineaDto);
      res.json({ success: true, data });
    } catch {
      res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
    }
  };

  const listInactive: RequestHandler = async (_req, res) => {
    try {
      const items = await service.findAllInactive();
      const data = items.map(toLineaDto);
      res.json({ success: true, data });
    } catch {
      res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
    }
  };

  const getOne: RequestHandler = async (req, res) => {
    const id = Number(req.params.id);
    try {
      const item = await service.findById(id);
      if (!item) {
        res.status(404).json({ success: false, error: { message: 'Registro no encontrado' } });
        return;
      }
      res.json({ success: true, data: toLineaDto(item) });
    } catch {
      res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
    }
  };

  const assignDevice: RequestHandler = async (req, res) => {
    const id = Number(req.params.id);
    const parsedBody = LineaProduccionDeviceSchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ success: false, error: { message: 'ID de dispositivo inválido' } });
      return;
    }
    const { hardwareId } = parsedBody.data;

    // Unassign device (hardwareId: null)
    if (hardwareId === null) {
      try {
        const em = RequestContext.getEntityManager()!;
        const linea = await unassignDeviceFromLinea(em, id);
        if (!linea) {
          res.status(404).json({ success: false, error: { message: 'Registro no encontrado' } });
          return;
        }
        res.json({ success: true, data: toLineaDto(linea) });
      } catch (err) {
        console.error('[unassignDevice error]', err);
        res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
      }
      return;
    }

    try {
      const em = RequestContext.getEntityManager()!;
      const result = await assignHardwareIdToLinea(em, id, hardwareId);
      if (!result) {
        res.status(404).json({ success: false, error: { message: 'Registro no encontrado' } });
        return;
      }

      // Best-effort side-effect: force the device to reconnect so it re-pairs
      // to its new línea immediately. Must never fail the HTTP response — the
      // REST assignment already succeeded, which is what the client cares about.
      try {
        disconnectDeviceByHardwareId(getIo(), hardwareId);
      } catch (err) {
        console.error('[assignDevice] failed to disconnect device socket', err);
      }

      const { linea, dispositivo } = result;
      const data = {
        id: linea.id,
        nombre: linea.nombre,
        rutaPasadaActiva: linea.rutaPasadaActiva,
        activo: linea.activo,
        dispositivo: toDispositivoDto(dispositivo),
      };

      res.json({ success: true, data });
    } catch (err) {
      if (err instanceof UniqueConstraintViolationException) {
        res.status(400).json({ success: false, error: { message: 'Ya existe un registro con ese valor' } });
        return;
      }
      if (err instanceof Error && err.message && err.message.startsWith('Validation Error')) {
        res.status(400).json({ success: false, error: { message: err.message.replace('Validation Error: ', '') } });
        return;
      }
      console.error('[assignDevice error]', err);
      res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
    }
  };

  return { list, listInactive, getOne, assignDevice };
}
