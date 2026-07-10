import type { Server, Socket } from 'socket.io';
import type { MikroORM } from '@mikro-orm/postgresql';
import { findLineaByHardwareId } from '../services/device-pairing.service.js';
import { deviceRegistryService } from '../services/device-registry.service.js';

/**
 * Connection-time device pairing. Runs once per socket connection, right
 * after the auth middlewares have set socket.data.isDevice / hardwareId.
 *
 * Replaces the former device branch of the `join-linea` handler: devices no
 * longer emit `join-linea` — pairing is resolved automatically on connect by
 * looking up the persistent hardwareId → línea mapping.
 *
 * Runs OUTSIDE RequestContext (socket connection callback), so it forks its
 * own EntityManager from the ORM instance rather than using
 * RequestContext.getEntityManager().
 */
export const handleDeviceConnection = async (
  io: Server,
  socket: Socket,
  orm: MikroORM,
): Promise<void> => {
  if (!socket.data.isDevice) {
    return;
  }

  const hardwareId = socket.data.hardwareId;
  if (!hardwareId) {
    return;
  }

  const em = orm.em.fork();
  const linea = await findLineaByHardwareId(em, hardwareId);

  if (!linea) {
    io.to('admin').emit('unknown-device-connected', { hardwareId });
    return;
  }

  socket.join(`linea-${linea.id}`);
  socket.data.lineaId = linea.id;
  deviceRegistryService.registerDevice(socket.id, linea.id);
  io.to(`linea-${linea.id}`).emit('balanza-status', { isConnected: true });
};
