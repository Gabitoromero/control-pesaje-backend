import type { FrameEntry } from './balanza-frame-ring.service.js';
import type { RbDiagnostic, ReportPantalla, ReportPayload } from './weight-issue-report.schemas.js';

/** Discord caps message content at 2000 chars; the notifier also slices at 1900. */
export const SUMMARY_MAX_LENGTH = 1900;
/** Hard cap for the .txt attachment (Discord allows far more; this bounds memory). */
export const ATTACHMENT_MAX_LENGTH = 256 * 1024;

const FIELD_MAX_LENGTH = 60;
const SERIAL_ERROR_SUMMARY_LENGTH = 100;
const SUMMARY_BACKEND_FRAMES = 5;
const SUMMARY_RB_RAW_FRAMES = 3;
const RB_RAW_PREVIEW_LENGTH = 40;
const RB_INVALID_RAW_MAX_LENGTH = 4000;
const TRUNCATED_MARKER = '\n[adjunto truncado]';

export type SesionEstado = 'sin-sesion' | 'puesta-a-punto' | 'operario';

export interface ReportSesion {
  estado: SesionEstado;
  usuarioId?: number | null;
  legajo?: string;
  nombreApellido?: string;
  nombreUsuario?: string;
  /** Milliseconds since the last session activity, when the session exists. */
  idleMs?: number;
  /** True when the idle time already exceeds the inactivity timeout. */
  vencida?: boolean;
  /** Why the operator lookup failed (error name or "no encontrado"). */
  lookupError?: string;
}

/** Best-effort facts about the línea; structurally compatible with `LineaContext`. */
export interface ReportBackendContext {
  lineaNombre?: string;
  rbNombre?: string;
  rbHardwareId?: string;
  rbConnected?: boolean;
  rbSocketActivo?: boolean;
  rbEnSala?: boolean;
  tabletSockets?: number;
  rbEstado?: 'conectado' | 'encendido' | 'desconectado';
  rbBeaconHaceMs?: number;
  rbUptimeS?: number;
  rbThrottled?: string;
  rbTempC?: number;
}

export interface ReportDevice {
  hardwareId: string;
  unidad: string | null;
}

export interface ReportTablet {
  payload: ReportPayload;
  /** Whether the tablet socket was in room `linea-<id>` according to the server. */
  serverEnSala: boolean;
  socketId: string;
}

export type RbResult =
  | { estado: 'ok'; diag: RbDiagnostic }
  | { estado: 'no-conectada' }
  | { estado: 'socket-no-encontrado' }
  | { estado: 'sin-respuesta' }
  | { estado: 'version-desconocida'; v: unknown; raw: string }
  | { estado: 'invalida'; raw: string };

export interface WeightIssueReport {
  reportId: string;
  /** Epoch milliseconds at which the report was accepted. */
  acceptedAt: number;
  /** Server-side línea (from `socket.data.lineaId`). */
  lineaId: number;
  /** Línea claimed by the client payload; only used for the cross-check. */
  clientLineaId: number | null;
  lineaMismatch: boolean;
  pantalla: ReportPantalla;
  tablet: ReportTablet;
  sesion: ReportSesion;
  backend: ReportBackendContext;
  device: ReportDevice | null;
  /** Backend frame ring snapshot, oldest to newest (up to 100). */
  frames: FrameEntry[];
  rb: RbResult;
}

const RB_NO_RESPONSE_TEXT = 'RB no respondió en 3 s (versión sin soporte o sin conexión)';
const RB_NOT_CONNECTED_TEXT = 'RB no conectada (no se solicitó diagnóstico)';
const SIN_SESION_TEXT = 'Sin sesión activa: las tramas se descartan (sin-sesion)';
const VENCIDA_TEXT = 'sesión vencida por inactividad, pendiente de cierre';

const clip = (value: string, max = FIELD_MAX_LENGTH): string => (value.length > max ? value.slice(0, max) : value);
const yesNo = (value: boolean | undefined): string => (value === true ? 'sí' : 'no');
const seconds = (ms: number): number => Math.round(ms / 1000);
const iso = (t: number): string => new Date(t).toISOString();

const mismatchText = (r: WeightIssueReport): string =>
  `lineaId del cliente (${r.clientLineaId === null ? 'null' : r.clientLineaId}) distinto del servidor (${r.lineaId})`;

const lineaLabel = (r: WeightIssueReport): string =>
  `Línea ${clip(r.backend.lineaNombre ?? '?')} (id ${r.lineaId})`;

const operatorText = (s: ReportSesion): string => {
  if (s.estado === 'sin-sesion') return SIN_SESION_TEXT;
  if (s.estado === 'puesta-a-punto') return 'Sesión en puesta a punto (sin operario)';
  const resolved = s.legajo !== undefined || s.nombreApellido !== undefined;
  const base = resolved
    ? `Operario: ${clip(s.legajo ?? '?')} ${clip(s.nombreApellido ?? '?')}`
    : `Operario: usuarioId ${s.usuarioId ?? '?'} (legajo/nombre no disponibles: ${clip(s.lookupError ?? 'desconocido')})`;
  return s.vencida === true ? `${base} | ${VENCIDA_TEXT}` : base;
};

const tabletText = (r: WeightIssueReport): string => {
  const p = r.tablet.payload;
  const peso =
    p.ultimoPeso === null
      ? 'sin pesos recibidos'
      : `último peso ${p.ultimoPeso} kg${p.ultimoPesoHaceMs === null ? '' : ` hace ${seconds(p.ultimoPesoHaceMs)} s`}`;
  return (
    `Tablet: socket ${yesNo(p.socketConectado)} · en sala ${yesNo(p.enSala)} (servidor: ${yesNo(r.tablet.serverEnSala)})` +
    ` · balanza conectada ${yesNo(p.balanzaConectada)} · ${peso}`
  );
};

const backendText = (b: ReportBackendContext): string => {
  const rb = `${clip(b.rbNombre ?? 'sin nombre')} (${clip(b.rbHardwareId ?? 'sin hardwareId')})`;
  return (
    `Backend: RB ${rb} registrada ${yesNo(b.rbConnected)} · socket ${b.rbSocketActivo === true ? 'activo' : 'no'}` +
    ` · en sala ${yesNo(b.rbEnSala)} · tablets en sala ${b.tabletSockets ?? '?'}`
  );
};

/** Short power/beacon line; null when the backend resolved no beacon facts. */
const powerText = (b: ReportBackendContext): string | null => {
  if (b.rbEstado === undefined) return null;
  const parts: string[] = [b.rbEstado];
  if (b.rbBeaconHaceMs !== undefined) parts.push(`beacon hace ${seconds(b.rbBeaconHaceMs)} s`);
  if (b.rbUptimeS !== undefined) parts.push(`uptime ${b.rbUptimeS} s`);
  if (b.rbThrottled !== undefined) parts.push(`throttled ${clip(b.rbThrottled)}`);
  if (b.rbTempC !== undefined) parts.push(`${b.rbTempC} °C`);
  return `Energía RB: ${parts.join(' · ')}`;
};

const frameResult = (f: FrameEntry): string => (f.aceptada ? 'ok' : (f.motivo ?? 'descartada'));
const frameValue = (f: FrameEntry): string => `${f.pesoNeto === null ? 's/d' : f.pesoNeto}${f.unidad ?? ''}`;

const framesCountText = (r: WeightIssueReport): string => {
  const head = `Tramas backend (${r.frames.length} en memoria): `;
  if (r.frames.length === 0) return `${head}ninguna`;
  const reasons = new Map<string, number>();
  let accepted = 0;
  for (const f of r.frames) {
    if (f.aceptada) accepted++;
    else reasons.set(f.motivo ?? 'descartada', (reasons.get(f.motivo ?? 'descartada') ?? 0) + 1);
  }
  const discarded = r.frames.length - accepted;
  const detail = [...reasons].map(([motivo, n]) => `${motivo}: ${n}`).join(', ');
  const last = r.frames[r.frames.length - 1];
  return (
    `${head}${accepted} aceptadas, ${discarded} descartadas${detail ? ` (${detail})` : ''}` +
    ` · última hace ${seconds(Math.max(0, r.acceptedAt - last.t))} s`
  );
};

const lastBackendFramesText = (r: WeightIssueReport): string | null => {
  if (r.frames.length === 0) return null;
  const newestFirst = r.frames.slice(-SUMMARY_BACKEND_FRAMES).reverse();
  const items = newestFirst.map((f) => `${seconds(Math.max(0, r.acceptedAt - f.t))} s ${frameValue(f)} ${frameResult(f)}`);
  return `Últimas ${SUMMARY_BACKEND_FRAMES} backend: ${items.join('; ')}`;
};

const serialText = (serial: RbDiagnostic['serial']): string => {
  if (serial.abierto) return `serial abierto ${clip(serial.path)}@${serial.baud}`;
  if (!serial.ultimoError) return `serial cerrado ${clip(serial.path)}@${serial.baud}`;
  const age = serial.ultimoErrorHaceMs == null ? '' : `hace ${seconds(serial.ultimoErrorHaceMs)} s, `;
  return `serial CERRADO: ${clip(serial.ultimoError, SERIAL_ERROR_SUMMARY_LENGTH)} (${age}${serial.intentosFallidos ?? 0} intentos)`;
};

const rbText = (rb: RbResult): string => {
  switch (rb.estado) {
    case 'ok': {
      const { version, serial, contadores } = rb.diag;
      const lastByte = serial.ultimoByteHaceMs === null ? 'sin bytes' : `último byte hace ${seconds(serial.ultimoByteHaceMs)} s`;
      return (
        `RB: versión ${clip(version)} · ${serialText(serial)}` +
        ` · ${lastByte} · bytes ${contadores.bytes} válidas ${contadores.validas} descartadas ${contadores.descartadas}`
      );
    }
    case 'no-conectada':
      return RB_NOT_CONNECTED_TEXT;
    case 'socket-no-encontrado':
      return 'Socket RB no encontrado';
    case 'sin-respuesta':
      return RB_NO_RESPONSE_TEXT;
    case 'version-desconocida':
      return `Respuesta RB inválida (v=${clip(String(rb.v))})`;
    case 'invalida':
      return 'Respuesta RB inválida';
  }
};

const lastRbRawText = (r: WeightIssueReport): string | null => {
  if (r.rb.estado !== 'ok' || r.rb.diag.tramasCrudas.length === 0) return null;
  const newestFirst = r.rb.diag.tramasCrudas.slice(-SUMMARY_RB_RAW_FRAMES).reverse();
  const items = newestFirst.map(
    (f) => `${seconds(Math.max(0, r.acceptedAt - f.t))} s ${clip(JSON.stringify(f.raw), RB_RAW_PREVIEW_LENGTH)}`,
  );
  return `Últimas ${SUMMARY_RB_RAW_FRAMES} RB crudas: ${items.join('; ')}`;
};

/**
 * Discord message content: key diagnosis facts and only the last few frames.
 * The complete detail lives in the attachment. Always <= SUMMARY_MAX_LENGTH.
 */
export const formatSummary = (r: WeightIssueReport): string => {
  const lines: Array<string | null> = [
    `:mag: **Reporte "No veo el peso"** · ${lineaLabel(r)} · ${r.pantalla}`,
    operatorText(r.sesion),
    tabletText(r),
    backendText(r.backend),
    powerText(r.backend),
    framesCountText(r),
    lastBackendFramesText(r),
    rbText(r.rb),
    lastRbRawText(r),
    r.lineaMismatch ? `:warning: ${mismatchText(r)}` : null,
    `Reporte ${r.reportId} · ${iso(r.acceptedAt)} · detalle completo en adjunto`,
  ];
  const text = lines.filter((l): l is string => l !== null).join('\n');
  return text.length > SUMMARY_MAX_LENGTH ? text.slice(0, SUMMARY_MAX_LENGTH) : text;
};

const sesionSection = (r: WeightIssueReport): string[] => {
  const s = r.sesion;
  const lines = [`estado: ${s.estado}`];
  if (s.estado === 'sin-sesion') lines.push(SIN_SESION_TEXT);
  if (s.usuarioId !== undefined && s.usuarioId !== null) lines.push(`usuarioId: ${s.usuarioId}`);
  if (s.legajo !== undefined) lines.push(`legajo: ${s.legajo}`);
  if (s.nombreApellido !== undefined) lines.push(`nombreApellido: ${s.nombreApellido}`);
  if (s.nombreUsuario !== undefined) lines.push(`nombreUsuario: ${s.nombreUsuario}`);
  if (s.lookupError !== undefined) lines.push(`lookupError: ${s.lookupError}`);
  if (s.idleMs !== undefined) lines.push(`idleMs: ${s.idleMs}`);
  if (s.vencida === true) lines.push(VENCIDA_TEXT);
  return lines;
};

const backendSection = (r: WeightIssueReport): string[] => {
  const b = r.backend;
  const lines = [
    `linea: ${b.lineaNombre ?? '?'} (id ${r.lineaId})`,
    `rbNombre: ${b.rbNombre ?? '-'}`,
    `rbHardwareId: ${b.rbHardwareId ?? '-'}`,
    `rbRegistrada: ${yesNo(b.rbConnected)}`,
    `rbSocketActivo: ${yesNo(b.rbSocketActivo)}`,
    `rbEnSala: ${yesNo(b.rbEnSala)}`,
    `tabletsEnSala: ${b.tabletSockets ?? '?'}`,
  ];
  if (b.rbEstado !== undefined) {
    lines.push(
      `rbEstado: ${b.rbEstado}`,
      `rbBeaconHaceMs: ${b.rbBeaconHaceMs ?? '-'}`,
      `rbUptimeS: ${b.rbUptimeS ?? '-'}`,
      `rbThrottled: ${b.rbThrottled ?? '-'}`,
      `rbTempC: ${b.rbTempC ?? '-'}`,
    );
  }
  if (r.device) lines.push(`dispositivo: ${r.device.hardwareId} unidad=${r.device.unidad ?? '-'}`);
  if (r.lineaMismatch) lines.push(mismatchText(r));
  return lines;
};

const backendFramesSection = (frames: FrameEntry[]): string[] => [
  `== Tramas backend (${frames.length}) ==`,
  ...frames.map((f) => `${iso(f.t)} | ${f.pesoNeto ?? '-'} | ${f.unidad ?? '-'} | ${f.aceptada ? 'aceptada' : `descartada:${f.motivo ?? '-'}`}`),
];

const rbSection = (rb: RbResult): string[] => {
  const lines = ['== RB ==', rbText(rb)];
  if (rb.estado === 'ok') {
    const { version, serial, contadores, tramasCrudas, logs } = rb.diag;
    lines.push(
      `version: ${version}`,
      `serial: abierto=${serial.abierto} path=${serial.path} baud=${serial.baud} ultimoByteHaceMs=${serial.ultimoByteHaceMs ?? '-'}` +
        ` ultimoError=${serial.ultimoError ?? '-'} ultimoErrorHaceMs=${serial.ultimoErrorHaceMs ?? '-'} intentosFallidos=${serial.intentosFallidos ?? '-'}`,
      `contadores: bytes=${contadores.bytes} validas=${contadores.validas} descartadas=${contadores.descartadas}`,
      `ultimaDescartada: ${contadores.ultimaDescartada === null ? '-' : JSON.stringify(contadores.ultimaDescartada)}`,
      `== RB tramas crudas (${tramasCrudas.length}) ==`,
      ...tramasCrudas.map((f) => `${iso(f.t)} | ${JSON.stringify(f.raw)}`),
      `== RB logs (${logs.length}) ==`,
      ...logs,
    );
  } else if (rb.estado === 'version-desconocida' || rb.estado === 'invalida') {
    lines.push(`raw: ${rb.raw.slice(0, RB_INVALID_RAW_MAX_LENGTH)}`);
  }
  return lines;
};

/** Plain-text attachment with the complete detail, capped at ATTACHMENT_MAX_LENGTH. */
export const formatAttachment = (r: WeightIssueReport): string => {
  const text = [
    '== Resumen ==',
    formatSummary(r),
    '',
    '== Tablet ==',
    JSON.stringify(r.tablet.payload, null, 2),
    `serverEnSala: ${yesNo(r.tablet.serverEnSala)}`,
    `socketId: ${r.tablet.socketId}`,
    '',
    '== Sesión ==',
    ...sesionSection(r),
    '',
    '== Backend ==',
    ...backendSection(r),
    '',
    ...backendFramesSection(r.frames),
    '',
    ...rbSection(r.rb),
    '',
  ].join('\n');
  if (text.length <= ATTACHMENT_MAX_LENGTH) return text;
  return text.slice(0, ATTACHMENT_MAX_LENGTH - TRUNCATED_MARKER.length) + TRUNCATED_MARKER;
};

const pad = (n: number): string => String(n).padStart(2, '0');

/** `reporte-sin-peso-linea-<id>-<yyyyMMddTHHmmss UTC>-<reportId>.txt` */
export const attachmentFilename = (r: WeightIssueReport): string => {
  const d = new Date(r.acceptedAt);
  const stamp =
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  const safeId = r.reportId.replace(/[^A-Za-z0-9_-]/g, '-');
  return `reporte-sin-peso-linea-${r.lineaId}-${stamp}-${safeId}.txt`;
};
