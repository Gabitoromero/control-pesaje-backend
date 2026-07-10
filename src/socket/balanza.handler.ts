import { z } from 'zod';
import type { Server, Socket } from 'socket.io';
import type { MikroORM } from '@mikro-orm/postgresql';
import type { SesionService } from '../services/sesion.service.js';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { deviceRegistryService } from '../services/device-registry.service.js';

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

    // Authentication guard: require either device identity or authenticated user
    if (!socket.data.isDevice && !socket.data.user) {
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

    const hasDevice = deviceRegistryService.hasDeviceForLinea(lineaId);
    socket.emit('balanza-status', { isConnected: hasDevice });
  });

  socket.on('leave-linea', (lineaId: number) => {
    if (!joinLineaSchema.safeParse(lineaId).success) {
      return;
    }

    socket.leave(`linea-${lineaId}`);
    if (socket.data.lineaId === lineaId) {
      socket.data.lineaId = undefined;
    }
    
    if (socket.data.isDevice) {
      deviceRegistryService.removeDevice(socket.id);
      io.to(`linea-${lineaId}`).emit('balanza-status', { isConnected: false });
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

    // RF-15 / RN-15: discard weight data during "puesta a punto".
    // Single call: obtenerSesion mutates on lazy expiry, so reuse the reference.
    const sesion = sesionService.obtenerSesion(lineaId);
    if (!sesion || sesion.usuarioId === null) {
      return; // no active operator session — silently discard
    }

    // Broadcast ONLY pesoNeto — never spread the full payload to avoid field leakage
    io.to(`linea-${lineaId}`).emit('balanza-data', { pesoNeto: payload.pesoNeto });
  });
};
