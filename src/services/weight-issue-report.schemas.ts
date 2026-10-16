import { z } from 'zod';

/** Screens that can render the "No veo el peso" button. */
export const REPORT_PANTALLAS = ['tablet', 'muestras-libres'] as const;
export type ReportPantalla = (typeof REPORT_PANTALLAS)[number];

/** Payload v1 sent by the tablet on `reportar-sin-peso`. Carries no operator identity. */
export const reportPayloadSchema = z.object({
  v: z.literal(1),
  lineaId: z.number().int().nullable(),
  ultimoPeso: z.number().finite().nullable(),
  ultimoPesoHaceMs: z.number().finite().nonnegative().nullable(),
  unidad: z.string().max(32).nullable(),
  socketConectado: z.boolean(),
  balanzaConectada: z.boolean(),
  enSala: z.boolean(),
  pantalla: z.enum(REPORT_PANTALLAS),
  clientTs: z.number().finite(),
});
export type ReportPayload = z.infer<typeof reportPayloadSchema>;

/** Caps are 2x the RB defaults (100 raw frames, 50 logs) to tolerate drift. */
export const RB_MAX_RAW_FRAMES = 200;
export const RB_MAX_LOGS = 100;

/** Response v1 of the RB to `diagnostico-solicitud`. */
export const rbDiagnosticSchema = z.object({
  v: z.literal(1),
  version: z.string().max(64),
  serial: z.object({
    abierto: z.boolean(),
    path: z.string().max(200),
    baud: z.number(),
    ultimoByteHaceMs: z.number().nullable(),
    // Added later: optional so an RB without them still validates.
    ultimoError: z.string().max(300).nullable().optional(),
    ultimoErrorHaceMs: z.number().nullable().optional(),
    intentosFallidos: z.number().int().nonnegative().optional(),
  }),
  contadores: z.object({
    bytes: z.number().int().nonnegative(),
    validas: z.number().int().nonnegative(),
    descartadas: z.number().int().nonnegative(),
    ultimaDescartada: z.string().nullable(),
  }),
  tramasCrudas: z.array(z.object({ t: z.number(), raw: z.string().max(200) })).max(RB_MAX_RAW_FRAMES),
  logs: z.array(z.string().max(400)).max(RB_MAX_LOGS),
});
export type RbDiagnostic = z.infer<typeof rbDiagnosticSchema>;

/**
 * Parsed first, so an unknown version (`v: 2`) is told apart from a response
 * that is simply malformed.
 */
export const rbVersionProbeSchema = z.object({ v: z.unknown() });

/** Ack returned to the tablet. `sent` means accepted, not delivered. */
export type ReportAck =
  | { ok: true; code: 'sent' }
  | { ok: false; code: 'cooldown'; retryAfterMs: number }
  | { ok: false; code: 'no-linea' | 'invalid-payload' | 'forbidden' | 'error' };
