import type { Server, Socket } from 'socket.io';
import type { MikroORM } from '@mikro-orm/postgresql';
import { LineaProduccion } from '../models/LineaProduccion.js';

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
): void => {
  socket.on('join-linea', async (lineaId: number) => {
    if (!Number.isInteger(lineaId) || lineaId <= 0) {
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
  });

  socket.on('leave-linea', (lineaId: number) => {
    socket.leave(`linea-${lineaId}`);
    if (socket.data.lineaId === lineaId) {
      socket.data.lineaId = undefined;
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

    // Broadcast ONLY pesoNeto — never spread the full payload to avoid field leakage
    io.to(`linea-${lineaId}`).emit('balanza-data', { pesoNeto: payload.pesoNeto });
  });
};
