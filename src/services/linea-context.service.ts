import type { Server } from 'socket.io';
import type { MikroORM } from '@mikro-orm/postgresql';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { deviceRegistryService, type DeviceRegistryService } from './device-registry.service.js';

/** Best-effort facts about a línea, resolved on demand. */
export interface LineaContext {
  lineaNombre?: string;
  rbNombre?: string;
  rbHardwareId?: string;
  /** Whether the RB socket is currently registered in the device registry. */
  rbConnected?: boolean;
  /** Non-device (tablet) sockets currently in room `linea-<id>`. */
  tabletSockets?: number;
}

/**
 * Builds a resolver that gathers best-effort facts about a línea. Each lookup is
 * independent: a DB failure still yields the registry/room data.
 */
export const createLineaContextResolver =
  (io: Server, orm: MikroORM, registry: Pick<DeviceRegistryService, 'getDeviceForLinea'> = deviceRegistryService) =>
  async (lineaId: number): Promise<LineaContext> => {
    const ctx: LineaContext = {};

    const device = registry.getDeviceForLinea(lineaId);
    ctx.rbConnected = device !== undefined;
    if (device) ctx.rbHardwareId = device.hardwareId;

    try {
      const room = io.sockets.adapter.rooms.get(`linea-${lineaId}`);
      let tablets = 0;
      for (const id of room ?? []) {
        if (io.sockets.sockets.get(id)?.data?.isDevice !== true) tablets++;
      }
      ctx.tabletSockets = tablets;
    } catch {
      // leave unknown
    }

    try {
      const linea = await orm.em
        .fork()
        .findOne(LineaProduccion, { id: lineaId }, { populate: ['dispositivo'] });
      if (linea) {
        ctx.lineaNombre = linea.nombre;
        if (linea.dispositivo) {
          ctx.rbNombre = linea.dispositivo.nombre;
          ctx.rbHardwareId ??= linea.dispositivo.hardwareId;
        }
      }
    } catch {
      // names stay unknown
    }

    return ctx;
  };
