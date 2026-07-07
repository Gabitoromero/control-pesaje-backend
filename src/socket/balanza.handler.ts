import type { Server, Socket } from 'socket.io';
import type { MikroORM } from '@mikro-orm/postgresql';
import type { SesionService } from '../services/sesion.service.js';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { deviceRegistryService } from '../services/device-registry.service.js';

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
  if (socket.data.isDevice && socket.data.hardwareId) {
    const hardwareId = socket.data.hardwareId;
    const assignDevice = async () => {
      const em = orm.em.fork();
      const linea = await em.findOne(LineaProduccion, { hardwareId, activo: true });
      if (linea) {
        socket.join(`linea-${linea.id}`);
        socket.data.lineaId = linea.id;
        deviceRegistryService.registerDevice(socket.id, linea.id);
        io.to(`linea-${linea.id}`).emit('balanza-status', { isConnected: true });
      } else {
        socket.join('unassigned-devices');
        io.emit('unknown-device-connected', { hardwareId });
      }
    };
    assignDevice().catch(console.error);
  }

  socket.on('join-linea', async (lineaId: number) => {
    if (!Number.isInteger(lineaId) || lineaId <= 0) {
      socket.emit('error', { message: 'Invalid lineaId: must be a positive integer' });
      return;
    }

    if (socket.data.isDevice) {
      socket.emit('error', { message: 'Devices cannot join lines manually' });
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
    if (socket.data.isDevice) {
      socket.emit('error', { message: 'Devices cannot leave lines manually' });
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

  socket.on('balanza-data', (payload: { pesoNeto: number }) => {
    if (!socket.data.isDevice) {
      socket.emit('error', { message: 'Forbidden: only devices can emit balanza-data' });
      return;
    }

    if (!Number.isFinite(payload?.pesoNeto)) {
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
