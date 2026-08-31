import type { Server, Socket } from 'socket.io';
import type { MikroORM } from '@mikro-orm/postgresql';
import { findDispositivoByHardwareId } from '../services/device-pairing.service.js';
import { deviceRegistryService } from '../services/device-registry.service.js';
import { isUnidadPeso } from '../shared/peso.js';

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
  const dispositivo = await findDispositivoByHardwareId(em, hardwareId);
  const linea = dispositivo?.lineaProduccion && dispositivo.lineaProduccion.activo
    ? dispositivo.lineaProduccion
    : null;

  if (!linea) {
    io.to('admin').emit('unknown-device-connected', { hardwareId });
    return;
  }

  // Fail closed on weight ingestion (spec: "Fail-closed on missing or unknown
  // unit"): a Dispositivo whose unidad is null or not a recognized value must
  // never have its balanza-data frames accepted (see balanza.handler.ts,
  // which re-checks unidad per frame via deviceRegistryService.getUnidad).
  //
  // It IS still joined to its línea and registered here (with unidad: null)
  // so the tablet learns its hardwareId through the normal balanza-status
  // channel and can configure the unit via PATCH /dispositivos/:id/unidad —
  // otherwise hardwareId would never reach the tablet (only devices that
  // already paired ever get broadcast), and the operator would have no way
  // to set the unit for a brand-new device in the first place.
  const unidadConfigurada = isUnidadPeso(dispositivo!.unidad) ? dispositivo!.unidad : null;

  socket.join(`linea-${linea.id}`);
  socket.data.lineaId = linea.id;
  deviceRegistryService.registerDevice(socket.id, linea.id, hardwareId, unidadConfigurada);

  // Durable "last time we saw it connect" signal. Written once per successful
  // pairing (not per balanza-data frame) to avoid hammering the DB — see
  // sdd/dispositivo-registry/design. Reuses the Dispositivo row already
  // loaded above (single query) instead of a second lookup.
  dispositivo!.ultimaConexionAt = new Date();
  await em.flush();

  if (unidadConfigurada === null) {
    socket.emit('error', {
      message: `Unidad de peso no configurada para el dispositivo ${hardwareId}`,
    });
  }

  // Extended payload (sdd/unidad-medida-peso Part B, decision B3): additive
  // hardwareId/unidad fields — same shape join-linea emits (balanza.handler.ts).
  // unidad is omitted (not sent as null) when still unconfigured, matching
  // the optional `unidad?: UnidadPeso` contract the tablet expects.
  io.to(`linea-${linea.id}`).emit('balanza-status', {
    isConnected: true,
    hardwareId,
    ...(unidadConfigurada !== null ? { unidad: unidadConfigurada } : {}),
  });
};

/**
 * Force-disconnects the currently connected device socket for a given
 * hardwareId, if any. Used right after a hardwareId is reassigned to a
 * different línea (via PUT /lineas-produccion/:id/device): disconnecting
 * simulates a network drop, which the Raspberry Pi client's automatic
 * reconnection logic will recover from — reconnecting re-runs the auth
 * middlewares and `handleDeviceConnection`, which re-pairs the device to its
 * NEW línea (the DB mapping has already been updated by then).
 *
 * Does nothing (no throw) when no matching device socket is connected —
 * this is a normal case, not an error.
 */
export const disconnectDeviceByHardwareId = (io: Server, hardwareId: string): void => {
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.isDevice && socket.data.hardwareId === hardwareId) {
      socket.disconnect(true);
      return;
    }
  }
};
