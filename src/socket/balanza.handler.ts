import { z } from 'zod';
import type { Server, Socket } from 'socket.io';
import type { MikroORM } from '@mikro-orm/postgresql';
import type { SesionService } from '../services/sesion.service.js';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { deviceRegistryService } from '../services/device-registry.service.js';
import { toKilogramos, isUnidadPeso } from '../shared/peso.js';
import type { UnidadPeso } from '../shared/types/domain.js';
import { balanzaFrameRing, type BalanzaFrameRing } from '../services/balanza-frame-ring.service.js';

/** Payload validation schemas for the balanza real-time channel. */
const joinLineaSchema = z.number().int().positive();
const balanzaDataSchema = z.object({
  pesoNeto: z.number().finite(),
  // Optional unit declared by the frame itself (the device reports what it read).
  unidad: z.string().refine(isUnidadPeso, { message: 'Invalid unidad' }).optional(),
});

/** Payload emitted by devices on `balanza-data`. */
interface BalanzaDataPayload {
  pesoNeto: number;
  /** Unit of `pesoNeto` when the scale transmits one; absent for unitless frames. */
  unidad?: UnidadPeso;
}

type DiscardReason = 'no-linea' | 'sin-unidad' | 'sin-sesion';

/**
 * Frames arrive ~19 times per second per device, so a discard is logged only
 * when the reason for this socket changes (tracked in `socket.data`).
 */
const logDiscardOnTransition = (socket: Socket, reason: DiscardReason): void => {
  if (socket.data.lastDiscardReason === reason) return;
  socket.data.lastDiscardReason = reason;
  console.warn(
    `[balanza] Frame discarded (${reason}) for device ${socket.data.hardwareId} lineaId=${socket.data.lineaId ?? 'none'}`,
  );
};

/** Logs once when frames flow again after a discard, then clears the tracked reason. */
const logAcceptedAfterDiscard = (socket: Socket): void => {
  if (socket.data.lastDiscardReason === undefined) return;
  console.log(
    `[balanza] Frames accepted again for device ${socket.data.hardwareId} lineaId=${socket.data.lineaId ?? 'none'}`,
  );
  socket.data.lastDiscardReason = undefined;
};

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
  frameRing: Pick<BalanzaFrameRing, 'record'> = balanzaFrameRing,
): void => {
  // The ring is diagnostics only: a failure here must never affect frame handling.
  const safeRecord = (lineaId: number, entry: Parameters<BalanzaFrameRing['record']>[1]): void => {
    try {
      frameRing.record(lineaId, entry);
    } catch (err) {
      console.error('[balanza] Failed to record frame in ring', err instanceof Error ? err.name : 'UnknownError');
    }
  };

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

  socket.on('disconnect', (reason: string) => {
    if (socket.data.isDevice) {
      const lineaId = socket.data.lineaId as number | undefined;
      console.warn(`[balanza] Device disconnected (${reason}) hardwareId=${socket.data.hardwareId} lineaId=${lineaId ?? 'none'}`);
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
      const invalidLineaId = socket.data.lineaId as number | undefined;
      if (invalidLineaId !== undefined) {
        const raw = (payload as { pesoNeto?: unknown } | null | undefined)?.pesoNeto;
        safeRecord(invalidLineaId, {
          pesoNeto: typeof raw === 'number' && Number.isFinite(raw) ? raw : null,
          unidad: null,
          aceptada: false,
          motivo: 'payload-invalido',
        });
      }
      socket.emit('error', {
        message: 'Invalid payload: pesoNeto must be a finite number and unidad, if present, must be g or kg',
      });
      return;
    }

    const lineaId = socket.data.lineaId as number | undefined;
    if (lineaId === undefined) {
      logDiscardOnTransition(socket, 'no-linea');
      return; // device must join a line before sending data
    }

    // Fail closed (spec: "Fail-closed on missing or unknown unit"): the
    // device's unidad is resolved once at pairing time (see
    // device-pairing.handler.ts) and cached in deviceRegistryService. A
    // missing/unknown unit must reject the sample rather than assume kg.
    const deviceUnidad = deviceRegistryService.getUnidad(socket.id);
    if (!isUnidadPeso(deviceUnidad)) {
      const hardwareId = socket.data.hardwareId as string | undefined;
      logDiscardOnTransition(socket, 'sin-unidad');
      safeRecord(lineaId, { pesoNeto: payload.pesoNeto, unidad: null, aceptada: false, motivo: 'sin-unidad' });
      socket.emit('error', {
        message: `Unidad de peso no configurada para el dispositivo ${hardwareId}`,
      });
      return;
    }

    // Effective unit: the frame's own unit wins (single conversion point is the
    // backend), otherwise fall back to the device's configured unit.
    const effectiveUnidad: UnidadPeso = payload.unidad ?? deviceUnidad;
    if (effectiveUnidad !== deviceUnidad) {
      // Frames arrive many times per second: warn once per (frame, device) unit
      // pair per socket, so a live unit correction that changes the pair warns again.
      const pair = `${effectiveUnidad}->${deviceUnidad}`;
      if (socket.data.unidadMismatchWarnedPair !== pair) {
        socket.data.unidadMismatchWarnedPair = pair;
        console.warn(
          `[balanza] Unit mismatch for device ${socket.data.hardwareId}: frame unidad=${effectiveUnidad}, ` +
            `device unidad=${deviceUnidad}. Using the frame unit.`,
        );
      }
    }

    // RF-15 / RN-15: discard weight data during "puesta a punto".
    // Single call: obtenerSesion mutates on lazy expiry, so reuse the reference.
    const sesion = sesionService.obtenerSesion(lineaId);
    if (!sesion || sesion.usuarioId === null) {
      logDiscardOnTransition(socket, 'sin-sesion');
      safeRecord(lineaId, { pesoNeto: payload.pesoNeto, unidad: effectiveUnidad, aceptada: false, motivo: 'sin-sesion' });
      return; // no active operator session — discard
    }

    logAcceptedAfterDiscard(socket);
    safeRecord(lineaId, { pesoNeto: payload.pesoNeto, unidad: effectiveUnidad, aceptada: true });

    // Convert to canonical kg before broadcasting. Past this point, every
    // weight in the system is kg (see sdd/unidad-medida-peso/design).
    const pesoNetoKg = toKilogramos(payload.pesoNeto, effectiveUnidad);

    // Broadcast ONLY pesoNeto — never spread the full payload to avoid field leakage
    io.to(`linea-${lineaId}`).emit('balanza-data', { pesoNeto: pesoNetoKg });
  });
};
