import { z } from 'zod';
import type { Server, Socket } from 'socket.io';
import type { MikroORM } from '@mikro-orm/postgresql';
import type { SesionService } from '../services/sesion.service.js';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { deviceRegistryService } from '../services/device-registry.service.js';
import { toKilogramos, isUnidadPeso } from '../shared/peso.js';

/** Payload validation schemas for the balanza real-time channel. */
const joinLineaSchema = z.number().int().positive();
const balanzaDataSchema = z.object({ pesoNeto: z.number().finite() });

/** Payload emitted by devices on `balanza-data`. */
interface BalanzaDataPayload {
  pesoNeto: number;
}

/**
 * Registers domain event handlers for the balanza (scale) real-time channel.
 *
 * join-linea  — validates lineaId, checks DB, joins the room for that line
 * leave-linea — leaves the room for that line, clears socket state
 * balanza-data — validates pesoNeto, broadcasts { pesoNeto } to the line room
 */
export const registerBalanzaHandlers = (
  io: Server,
  socket: Socket,
  orm: MikroORM,
  sesionService: SesionService,
): void => {
  socket.on('join-linea', async (lineaId: number) => {
    if (!joinLineaSchema.safeParse(lineaId).success) {
      socket.emit('error', { message: 'Invalid lineaId: must be a positive integer' });
      return;
    }

    // Devices are paired to a línea exclusively via handleDeviceConnection
    // (hardwareId → Dispositivo lookup in the DB). join-linea is the tablet
    // path; letting isDevice sockets call it would let anyone claiming an
    // arbitrary hardwareId join — and inject balanza-data into — any línea.
    if (socket.data.isDevice) {
      socket.emit('error', { message: 'Forbidden: devices cannot join-linea manually' });
      return;
    }

    // Authentication guard: require an authenticated user (tablet)
    if (!socket.data.user) {
      socket.emit('error', { message: 'Unauthorized: authentication required' });
      return;
    }

    const em = orm.em.fork();
    const linea = await em.findOne(LineaProduccion, { id: lineaId, activo: true });

    if (!linea) {
      socket.emit('error', { message: 'Linea not found or inactive' });
      return;
    }

    socket.join(`linea-${lineaId}`);
    socket.data.lineaId = lineaId;

    // Extended payload (sdd/unidad-medida-peso Part B, decision B3): additive
    // hardwareId/unidad fields give the tablet the current unit for free, both
    // on initial join and after a live correction re-emit (see B2/B3).
    const device = deviceRegistryService.getDeviceForLinea(lineaId);
    socket.emit('balanza-status', {
      isConnected: device !== undefined,
      ...(device !== undefined ? { hardwareId: device.hardwareId } : {}),
      ...(device?.unidad != null ? { unidad: device.unidad } : {}),
    });
  });

  socket.on('leave-linea', (lineaId: number) => {
    if (!joinLineaSchema.safeParse(lineaId).success) {
      return;
    }

    socket.leave(`linea-${lineaId}`);
    if (socket.data.lineaId === lineaId) {
      socket.data.lineaId = undefined;
    }
  });

  socket.on('disconnect', () => {
    if (socket.data.isDevice) {
      const lineaId = socket.data.lineaId as number | undefined;
      deviceRegistryService.removeDevice(socket.id);
      if (lineaId !== undefined) {
        io.to(`linea-${lineaId}`).emit('balanza-status', { isConnected: false });
      }
    }
  });

  socket.on('balanza-data', (payload: BalanzaDataPayload) => {
    if (!socket.data.isDevice) {
      socket.emit('error', { message: 'Forbidden: only devices can emit balanza-data' });
      return;
    }

    if (!balanzaDataSchema.safeParse(payload).success) {
      socket.emit('error', { message: 'Invalid pesoNeto: must be a finite number' });
      return;
    }

    const lineaId = socket.data.lineaId as number | undefined;
    if (lineaId === undefined) {
      return; // device must join a line before sending data
    }

    // Fail closed (spec: "Fail-closed on missing or unknown unit"): the
    // device's unidad is resolved once at pairing time (see
    // device-pairing.handler.ts) and cached in deviceRegistryService. A
    // missing/unknown unit must reject the sample rather than assume kg.
    const unidad = deviceRegistryService.getUnidad(socket.id);
    if (!isUnidadPeso(unidad)) {
      const hardwareId = socket.data.hardwareId as string | undefined;
      socket.emit('error', {
        message: `Unidad de peso no configurada para el dispositivo ${hardwareId}`,
      });
      return;
    }

    // RF-15 / RN-15: discard weight data during "puesta a punto".
    // Single call: obtenerSesion mutates on lazy expiry, so reuse the reference.
    const sesion = sesionService.obtenerSesion(lineaId);
    if (!sesion || sesion.usuarioId === null) {
      return; // no active operator session — silently discard
    }

    // Convert to canonical kg before broadcasting. Past this point, every
    // weight in the system is kg (see sdd/unidad-medida-peso/design).
    const pesoNetoKg = toKilogramos(payload.pesoNeto, unidad);

    // Broadcast ONLY pesoNeto — never spread the full payload to avoid field leakage
    io.to(`linea-${lineaId}`).emit('balanza-data', { pesoNeto: pesoNetoKg });
  });
};
