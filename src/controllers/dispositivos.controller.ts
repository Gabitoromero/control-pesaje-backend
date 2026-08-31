import type { Request, Response } from 'express';
import { RequestContext } from '@mikro-orm/core';
import { Dispositivo } from '../models/Dispositivo.js';
import { deviceRegistryService } from '../services/device-registry.service.js';
import { DispositivoCreateSchema, DispositivoUpdateSchema, DispositivoUnidadUpdateSchema } from '../shared/schemas.js';
import { disconnectDeviceByHardwareId } from '../socket/device-pairing.handler.js';
import { getIo } from '../socket/index.js';

export const getDispositivosConectados = async (req: Request, res: Response): Promise<void> => {
  const em = RequestContext.getEntityManager();
  if (!em) {
    res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
    return;
  }

  try {
    const dispositivos = await em.find(Dispositivo, {}, { populate: ['lineaProduccion'] });
    const data = dispositivos.map((dispositivo) => ({
      hardwareId: dispositivo.hardwareId,
      nombre: dispositivo.nombre,
      lineaId: dispositivo.lineaProduccion?.id ?? null,
      lineaNombre: dispositivo.lineaProduccion?.nombre ?? null,
      estado: deviceRegistryService.isHardwareIdConnected(dispositivo.hardwareId)
        ? 'Conectado'
        : 'Desconectado',
      ultimaConexionAt: dispositivo.ultimaConexionAt ?? null,
      unidad: dispositivo.unidad ?? null,
    }));
    res.json({ success: true, data });
  } catch (err) {
    console.error('[getDispositivosConectados error]', err);
    res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
  }
};

export const createDispositivo = async (req: Request, res: Response): Promise<void> => {
  const em = RequestContext.getEntityManager();
  if (!em) {
    res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
    return;
  }
  try {
    const parseRes = DispositivoCreateSchema.safeParse(req.body);
    if (!parseRes.success) {
      res.status(400).json({ success: false, error: { message: 'Datos inválidos' } });
      return;
    }
    const data = parseRes.data;
    
    const existing = await em.findOne(Dispositivo, { hardwareId: data.hardwareId });
    if (existing) {
      res.status(400).json({ success: false, error: { message: 'El dispositivo ya existe' } });
      return;
    }
    
    const nombre = data.nombre ?? `Pi-${data.hardwareId.substring(0, 4)}`;
    const dispositivo = em.create(Dispositivo, { hardwareId: data.hardwareId, nombre, unidad: data.unidad });
    await em.flush();
    res.status(201).json({ success: true, data: {
      hardwareId: dispositivo.hardwareId,
      nombre: dispositivo.nombre,
      lineaId: null,
      lineaNombre: null,
      estado: 'Desconectado',
      ultimaConexionAt: null,
    } });
  } catch (err) {
    console.error('[createDispositivo error]', err);
    res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
  }
};

export const updateDispositivo = async (req: Request, res: Response): Promise<void> => {
  const hardwareId = req.params.id;
  const em = RequestContext.getEntityManager();
  if (!em) {
    res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
    return;
  }
  try {
    const parseRes = DispositivoUpdateSchema.safeParse(req.body);
    if (!parseRes.success) {
      res.status(400).json({ success: false, error: { message: 'Datos inválidos' } });
      return;
    }
    const dispositivo = await em.findOne(Dispositivo, { hardwareId }, { populate: ['lineaProduccion'] });
    if (!dispositivo) {
      res.status(404).json({ success: false, error: { message: 'Registro no encontrado' } });
      return;
    }
    
    if (parseRes.data.nombre !== undefined) {
      dispositivo.nombre = parseRes.data.nombre;
    }
    if (parseRes.data.unidad !== undefined) {
      dispositivo.unidad = parseRes.data.unidad;
    }
    await em.flush();
    res.json({ success: true, data: {
      hardwareId: dispositivo.hardwareId,
      nombre: dispositivo.nombre,
      lineaId: dispositivo.lineaProduccion?.id ?? null,
      lineaNombre: dispositivo.lineaProduccion?.nombre ?? null,
      estado: deviceRegistryService.isHardwareIdConnected(dispositivo.hardwareId) ? 'Conectado' : 'Desconectado',
      ultimaConexionAt: dispositivo.ultimaConexionAt ?? null,
    } });
  } catch (err) {
    console.error('[updateDispositivo error]', err);
    res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
  }
};

/**
 * Live unidad correction (sdd/unidad-medida-peso Part B, decision B6 ordering):
 * DB flush -> cache write-through -> socket re-emit (best-effort) -> 200.
 * If the flush fails, nothing else runs — no client ever observes a value the
 * DB does not hold. The socket emit is wrapped in try/catch, mirroring
 * deleteDispositivo, so a socket failure never fails a persisted change.
 */
export const updateDispositivoUnidad = async (req: Request, res: Response): Promise<void> => {
  const hardwareId = req.params.id;
  const em = RequestContext.getEntityManager();
  if (!em) {
    res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
    return;
  }
  try {
    const parseRes = DispositivoUnidadUpdateSchema.safeParse(req.body);
    if (!parseRes.success) {
      res.status(400).json({ success: false, error: { message: 'Datos inválidos' } });
      return;
    }

    const dispositivo = await em.findOne(Dispositivo, { hardwareId }, { populate: ['lineaProduccion'] });
    if (!dispositivo) {
      res.status(404).json({ success: false, error: { message: 'Registro no encontrado' } });
      return;
    }

    dispositivo.unidad = parseRes.data.unidad;
    await em.flush();

    deviceRegistryService.updateUnidadByHardwareId(String(hardwareId), parseRes.data.unidad);

    const lineaId = dispositivo.lineaProduccion?.id;
    if (lineaId !== undefined) {
      try {
        getIo().to(`linea-${lineaId}`).emit('balanza-status', {
          isConnected: true,
          hardwareId,
          unidad: parseRes.data.unidad,
        });
      } catch (err) {
        console.error('[updateDispositivoUnidad] failed to emit balanza-status', err);
      }
    }

    res.json({ success: true, data: { hardwareId, unidad: dispositivo.unidad } });
  } catch (err) {
    console.error('[updateDispositivoUnidad error]', err);
    res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
  }
};

export const deleteDispositivo = async (req: Request, res: Response): Promise<void> => {
  const hardwareId = req.params.id;
  const em = RequestContext.getEntityManager();
  if (!em) {
    res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
    return;
  }

  try {
    const deletedCount = await em.nativeDelete(Dispositivo, { hardwareId });
    if (deletedCount === 0) {
      res.status(404).json({ success: false, error: { message: 'Registro no encontrado' } });
      return;
    }

    // Best-effort side-effect: force the device to reconnect so it re-runs
    // the pairing handshake from scratch (re-emitting `unknown-device-connected`
    // if still unregistered). Must never fail the HTTP response — the
    // deletion already succeeded, which is what the client cares about.
    try {
      disconnectDeviceByHardwareId(getIo(), String(hardwareId));
    } catch (err) {
      console.error('[deleteDispositivo] failed to disconnect device socket', err);
    }

    res.json({ success: true, data: { hardwareId } });
  } catch (err) {
    console.error('[deleteDispositivo error]', err);
    res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
  }
};
