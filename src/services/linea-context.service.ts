import type { Server } from 'socket.io';
import type { MikroORM } from '@mikro-orm/postgresql';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { deviceRegistryService, type DeviceRegistryService } from './device-registry.service.js';
import { rbBeaconService, type RbBeaconService } from './rb-beacon.service.js';

/** Best-effort facts about a línea, resolved on demand. */
export interface LineaContext {
  lineaNombre?: string;
  rbNombre?: string;
  rbHardwareId?: string;
  /** Whether the RB socket is currently registered in the device registry. */
  rbConnected?: boolean;
  /** Whether the registered RB's socket is currently connected. Unset when no RB is registered. */
  rbSocketActivo?: boolean;
  /** Whether the registered RB's socket is in room `linea-<id>`. Unset when no RB is registered. */
  rbEnSala?: boolean;
  /** Non-device (tablet) sockets currently in room `linea-<id>`. */
  tabletSockets?: number;
  /** Power/liveness of the RB: socket registered, only a fresh HTTP beacon, or neither. Unset when no hardwareId is known. */
  rbEstado?: 'conectado' | 'encendido' | 'desconectado';
  /** Milliseconds since the last beacon received from the RB (even if stale). */
  rbBeaconHaceMs?: number;
  rbUptimeS?: number;
  rbThrottled?: string;
  rbTempC?: number;
}

/**
 * Builds a resolver that gathers best-effort facts about a línea. Each lookup is
 * independent: a DB failure still yields the registry/room data.
 */
export const createLineaContextResolver =
  (io: Server, orm: MikroORM, registry: Pick<DeviceRegistryService, 'getDeviceForLinea'> = deviceRegistryService,
    beacons: Pick<RbBeaconService, 'get' | 'isFresh'> = rbBeaconService,
  ) =>
  async (lineaId: number): Promise<LineaContext> => {
    const ctx: LineaContext = {};

    const device = registry.getDeviceForLinea(lineaId);
    ctx.rbConnected = device !== undefined;
    if (device) {
      ctx.rbHardwareId = device.hardwareId;
      try {
        const rbSocket = io.sockets.sockets.get(device.socketId);
        ctx.rbSocketActivo = rbSocket?.connected === true;
        ctx.rbEnSala = rbSocket?.rooms?.has(`linea-${lineaId}`) === true;
      } catch {
        // leave unknown
      }
    }

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

    if (ctx.rbHardwareId !== undefined) {
      try {
        const beacon = beacons.get(ctx.rbHardwareId);
        if (beacon) {
          ctx.rbBeaconHaceMs = beacon.ageMs;
          if (beacon.uptimeS !== undefined) ctx.rbUptimeS = beacon.uptimeS;
          if (beacon.throttled !== undefined) ctx.rbThrottled = beacon.throttled;
          if (beacon.tempC !== undefined) ctx.rbTempC = beacon.tempC;
        }
        ctx.rbEstado = ctx.rbConnected ? 'conectado' : beacons.isFresh(ctx.rbHardwareId) ? 'encendido' : 'desconectado';
      } catch {
        // beacon facts stay unknown
      }
    }

    return ctx;
  };
