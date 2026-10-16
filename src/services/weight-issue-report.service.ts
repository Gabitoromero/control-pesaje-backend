import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import type { MikroORM } from '@mikro-orm/postgresql';
import { Usuario } from '../models/Usuario.js';
import type { BalanzaFrameRing } from './balanza-frame-ring.service.js';
import type { ConnectedDevice, DeviceRegistryService } from './device-registry.service.js';
import type { DiscordNotifier } from './discord-notifier.service.js';
import type { LineaContext } from './linea-context.service.js';
import type { SesionActiva, SesionService } from './sesion.service.js';
import { formatAttachment, formatSummary, attachmentFilename } from './weight-issue-report.formatter.js';
import type { RbResult, ReportSesion, WeightIssueReport } from './weight-issue-report.formatter.js';
import { deliverReport } from './weight-issue-report.delivery.js';
import {
  rbDiagnosticSchema,
  rbVersionProbeSchema,
  reportPayloadSchema,
  type ReportAck,
  type ReportPayload,
} from './weight-issue-report.schemas.js';

const DEFAULT_COOLDOWN_MS = 60_000;
const DEFAULT_RB_TIMEOUT_MS = 3_000;
const RB_RAW_MAX_LENGTH = 4_000;

export interface WeightIssueReporterDeps {
  io: Pick<Server, 'sockets'>;
  orm: Pick<MikroORM, 'em'>;
  registry: Pick<DeviceRegistryService, 'getDeviceForLinea'>;
  sesion: Pick<SesionService, 'peekSesion' | 'getInactivityTimeoutMs'>;
  frameRing: Pick<BalanzaFrameRing, 'snapshot'>;
  resolveLineaContext: (lineaId: number) => Promise<LineaContext>;
  notifier: Pick<DiscordNotifier, 'send'>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  newReportId?: () => string;
  log?: Pick<Console, 'log' | 'warn' | 'error'>;
  cooldownMs?: number;
  rbTimeoutMs?: number;
}

export interface WeightIssueReporter {
  /** Sync: validates, binds the línea and applies the cooldown. Never throws; `completion` never rejects. */
  submit(socket: Socket, payload: unknown): { ack: ReportAck; completion: Promise<void> };
}

/** Evidence captured at the moment of the press, before any async work. */
interface AcceptedReport {
  reportId: string;
  acceptedAt: number;
  lineaId: number;
  payload: ReportPayload;
  socketId: string;
  serverEnSala: boolean;
  device: ConnectedDevice | undefined;
  sesion: SesionActiva | null;
  frames: WeightIssueReport['frames'];
}

const errorName = (err: unknown): string => (err instanceof Error ? err.name : 'UnknownError');

const safeStringify = (value: unknown): string => {
  try {
    return (JSON.stringify(value) ?? String(value)).slice(0, RB_RAW_MAX_LENGTH);
  } catch {
    return '[unserializable]';
  }
};

export const createWeightIssueReporter = (deps: WeightIssueReporterDeps): WeightIssueReporter => {
  const now = deps.now ?? Date.now;
  const newReportId = deps.newReportId ?? (() => randomUUID().slice(0, 8));
  const logger = deps.log ?? console;
  const cooldownMs = deps.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const rbTimeoutMs = deps.rbTimeoutMs ?? DEFAULT_RB_TIMEOUT_MS;
  /** Last accepted report per línea; pruned on every submit so it is bounded by active líneas. */
  const lastAcceptedAt = new Map<number, number>();

  // A broken logger must never turn into an exception for the socket layer.
  const emit = (level: 'log' | 'warn' | 'error', text: string): void => {
    try {
      logger[level](text);
    } catch {
      /* logging is best effort */
    }
  };

  const requestRb = async (a: AcceptedReport): Promise<RbResult> => {
    if (!a.device) return { estado: 'no-conectada' };
    const rbSocket = deps.io.sockets.sockets.get(a.device.socketId);
    if (!rbSocket) return { estado: 'socket-no-encontrado' };

    let response: unknown;
    try {
      response = await rbSocket.timeout(rbTimeoutMs).emitWithAck('diagnostico-solicitud', { v: 1 });
    } catch {
      return { estado: 'sin-respuesta' };
    }

    const probe = rbVersionProbeSchema.safeParse(response);
    if (probe.success && probe.data.v !== 1) return { estado: 'version-desconocida', v: probe.data.v, raw: safeStringify(response) };
    const parsed = rbDiagnosticSchema.safeParse(response);
    return parsed.success ? { estado: 'ok', diag: parsed.data } : { estado: 'invalida', raw: safeStringify(response) };
  };

  const lookupOperator = async (a: AcceptedReport): Promise<ReportSesion> => {
    if (!a.sesion) return { estado: 'sin-sesion' };
    const idleMs = a.sesion.ultimaActividadAt ? Math.max(0, a.acceptedAt - a.sesion.ultimaActividadAt.getTime()) : undefined;
    const base = {
      idleMs,
      vencida: idleMs !== undefined && idleMs > deps.sesion.getInactivityTimeoutMs(),
    };
    if (a.sesion.usuarioId === null) return { estado: 'puesta-a-punto', usuarioId: null, ...base };

    const usuarioId = a.sesion.usuarioId;
    try {
      const user = await deps.orm.em
        .fork()
        .findOne(Usuario, { id: usuarioId }, { fields: ['legajo', 'nombreApellido', 'nombreUsuario'] });
      if (!user) return { estado: 'operario', usuarioId, lookupError: 'no encontrado', ...base };
      return {
        estado: 'operario',
        usuarioId,
        legajo: user.legajo,
        nombreApellido: user.nombreApellido,
        nombreUsuario: user.nombreUsuario,
        ...base,
      };
    } catch (err) {
      return { estado: 'operario', usuarioId, lookupError: errorName(err), ...base };
    }
  };

  const resolveContext = async (lineaId: number): Promise<LineaContext> => {
    try {
      return await deps.resolveLineaContext(lineaId);
    } catch {
      return {};
    }
  };

  /** Each section settles on its own, so one failing never prevents the report. */
  const runPipeline = async (a: AcceptedReport): Promise<void> => {
    try {
      const [rb, sesion, backend] = await Promise.all([requestRb(a), lookupOperator(a), resolveContext(a.lineaId)]);
      const report: WeightIssueReport = {
        reportId: a.reportId,
        acceptedAt: a.acceptedAt,
        lineaId: a.lineaId,
        clientLineaId: a.payload.lineaId,
        lineaMismatch: a.payload.lineaId !== a.lineaId,
        pantalla: a.payload.pantalla,
        tablet: { payload: a.payload, serverEnSala: a.serverEnSala, socketId: a.socketId },
        sesion,
        backend,
        device: a.device ? { hardwareId: a.device.hardwareId, unidad: a.device.unidad } : null,
        frames: a.frames,
        rb,
      };
      await deliverReport(
        deps.notifier,
        { content: formatSummary(report), attachment: { filename: attachmentFilename(report), text: formatAttachment(report) } },
        { reportId: a.reportId, lineaId: a.lineaId },
        { sleep: deps.sleep, log: logger, now },
      );
    } catch (err) {
      emit('error', `[weight-report] report=${a.reportId} linea=${a.lineaId} pipeline failed (${errorName(err)})`);
    }
  };

  const reject = (ack: Extract<ReportAck, { ok: false }>): { ack: ReportAck; completion: Promise<void> } => {
    emit('warn', `[weight-report] rejected code=${ack.code}`);
    return { ack, completion: Promise.resolve() };
  };

  const prune = (at: number): void => {
    for (const [lineaId, last] of lastAcceptedAt) {
      if (at - last >= cooldownMs) lastAcceptedAt.delete(lineaId);
    }
  };

  const submit: WeightIssueReporter['submit'] = (socket, payload) => {
    try {
      if (socket.data.isDevice === true || !socket.data.user) return reject({ ok: false, code: 'forbidden' });

      const parsed = reportPayloadSchema.safeParse(payload);
      if (!parsed.success) return reject({ ok: false, code: 'invalid-payload' });

      const lineaId: unknown = socket.data.lineaId;
      if (typeof lineaId !== 'number') return reject({ ok: false, code: 'no-linea' });

      const acceptedAt = now();
      prune(acceptedAt);
      const last = lastAcceptedAt.get(lineaId);
      if (last !== undefined) return reject({ ok: false, code: 'cooldown', retryAfterMs: cooldownMs - (acceptedAt - last) });

      // Snapshot first: an error here must not consume the cooldown.
      const device = deps.registry.getDeviceForLinea(lineaId);
      const accepted: AcceptedReport = {
        reportId: newReportId(),
        acceptedAt,
        lineaId,
        payload: parsed.data,
        socketId: socket.id,
        serverEnSala: socket.rooms.has(`linea-${lineaId}`),
        device: device ? { ...device } : undefined,
        sesion: deps.sesion.peekSesion(lineaId),
        frames: deps.frameRing.snapshot(lineaId),
      };
      lastAcceptedAt.set(lineaId, acceptedAt);
      emit('log', `[weight-report] report=${accepted.reportId} linea=${lineaId} accepted (pantalla=${accepted.payload.pantalla})`);
      return { ack: { ok: true, code: 'sent' }, completion: runPipeline(accepted) };
    } catch (err) {
      emit('error', `[weight-report] submit failed (${errorName(err)})`);
      return { ack: { ok: false, code: 'error' }, completion: Promise.resolve() };
    }
  };

  return { submit };
};
