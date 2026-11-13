import { z } from 'zod';
import { UsuarioRol, SectorUsuario } from './types.js';
import { MAGNITUDES, MAX_ATRIBUTOS_POR_ETAPA, TIPOS_ATRIBUTO } from './constants.js';

// ─── Usuario ─────────────────────────────────────────────────────────────────

export const UsuarioCreateSchema = z.object({
  nombreApellido: z.string().min(1),
  nombreUsuario: z.string().min(3),
  legajo: z.string().regex(/^[0-9]{5}$/, 'Debe tener exactamente 5 dígitos numéricos'),
  pin: z.string().regex(/^\d{4,6}$/),
  puedeTomarMuestrasLibres: z.boolean().optional(),
  activo: z.boolean().optional(),
  rol: z.enum([
    UsuarioRol.OPERARIO,
    UsuarioRol.JEFE,
    UsuarioRol.VISUALIZACION,
    UsuarioRol.ADMINISTRADOR,
  ]),
  datosAdicionales: z.object({
    sector: z.enum([
      SectorUsuario.OFICIALES,
      SectorUsuario.SUPERVISORES,
      SectorUsuario.CONTROL_CALIDAD,
      SectorUsuario.MEJORA_CONTINUA,
    ]).nullable(),
    preferenciasInterfaz: z.object({
      tema: z.enum(['claro', 'oscuro']),
      idioma: z.enum(['es', 'en']),
    }).partial().optional(),
    configuracionBalanzaDefecto: z.object({
      estabilizacionMs: z.number().optional(),
      taraDefecto: z.number().optional(),
    }).optional(),
  }).partial().optional(),
});

export const UsuarioUpdateSchema = UsuarioCreateSchema.partial();

// ─── Articulo ─────────────────────────────────────────────────────────────────

export const ArticuloCreateSchema = z.object({
  codigo: z.string().min(1),
  nombre: z.string().min(1),
  descripcion: z.string().min(4).nullable().optional(),
  activo: z.boolean().optional(),
});

export const ArticuloUpdateSchema = ArticuloCreateSchema.partial();

// ─── Etapa ────────────────────────────────────────────────────────────────────

export const EtapaCreateSchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().min(4).nullable().optional(),
  activo: z.boolean().optional(),
});

export const EtapaUpdateSchema = EtapaCreateSchema.partial();

// ─── Balanza ──────────────────────────────────────────────────────────────────

export const BalanzaCreateSchema = z.object({
  nombre: z.string().min(1),
  activo: z.boolean().optional(),
});

export const BalanzaUpdateSchema = BalanzaCreateSchema.partial();

// ─── LineaProduccion ──────────────────────────────────────────────────────────

export const LineaProduccionCreateSchema = z.object({
  nombre: z.string().min(1),
  articuloId: z.number().int().positive(),
  idBalanza: z.number().int().positive(),
  rutaPasadaActiva: z.number().int().positive().nullable().optional(),
  activo: z.boolean().optional(),
  observacion: z.string().min(1).nullable().optional(),
});

export const LineaProduccionUpdateSchema = LineaProduccionCreateSchema.partial();

export const LineaProduccionDeviceSchema = z.object({
  hardwareId: z.string().uuid().nullable(),
});

// `unidad` stays optional at create time to match migration 1 (nullable
// column) — see sdd/unidad-medida-peso/design "Migration / Rollout". It only
// becomes mandatory once migration 2 (SET NOT NULL) ships, together with the
// backfill of every existing device.
export const DispositivoCreateSchema = z.object({
  hardwareId: z.string().min(1),
  nombre: z.string().min(1).optional(),
  unidad: z.enum(['g', 'kg']).optional(),
});

export const DispositivoUpdateSchema = z.object({
  nombre: z.string().min(1).optional(),
  unidad: z.enum(['g', 'kg']).optional(),
});

// Dedicated schema for the live unidad-correction endpoint (PATCH
// /dispositivos/:id/unidad — sdd/unidad-medida-peso Part B, decision B1).
// Same enum domain as create/update, single source of truth.
export const DispositivoUnidadUpdateSchema = z.object({
  unidad: z.enum(['g', 'kg']),
});

// Unauthenticated device-facing beacon (POST /dispositivos/beacon). Bounded
// fields only: this payload is never persisted, just kept in memory.
export const DispositivoBeaconSchema = z.object({
  hardwareId: z.string().min(1).max(255),
  uptimeS: z.number().finite().min(0).optional(),
  throttled: z.string().max(32).optional(),
  tempC: z.number().finite().min(-50).max(150).optional(),
});

// ─── RutaPasada ───────────────────────────────────────────────────────────────

export const RutaPasadaCreateSchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().min(4).nullable().optional(),
  activo: z.boolean().optional(),
  etapas: z.array(z.lazy(() => RutaPasadaEtapaCreateSchema.omit({ rutaPasada: true }))).optional(),
});

export const RutaPasadaUpdateSchema = RutaPasadaCreateSchema.partial();

// ─── AtributoEtapaRuta ────────────────────────────────────────────────────────

// Manual quality defined inside a ruta-etapa. The cross-field rules (numerico needs a range with
// minimo <= maximo; aceptado is fixed to 1..1; names unique per etapa) live in RutaPasadaService.
export const AtributoEtapaRutaInputSchema = z.object({
  id: z.number().int().positive().optional(),
  nombre: z.string().trim().min(1).max(100),
  tipo: z.enum(TIPOS_ATRIBUTO),
  minimo: z.number().finite().min(-99999999).max(99999999).optional(),
  maximo: z.number().finite().min(-99999999).max(99999999).optional(),
});

// ─── RutaPasadaEtapa ──────────────────────────────────────────────────────────

export const RutaPasadaEtapaCreateSchema = z.object({
  id: z.number().int().positive().optional(),
  rutaPasada: z.number().int().positive().optional(),
  etapa: z.number().int().positive(),
  orden: z.number().int(),
  pesoIdeal: z.number().positive(),
  pesoMinimo: z.number().positive(),
  pesoMaximo: z.number().positive(),
  cantidadMuestrasRequeridas: z.number().int().positive(),
  // Per-etapa tolerance (percent). Like the global tolerance (SC-001), the backend imposes no business
  // cap: the 0-50 range is enforced by the UI only. The max is just the decimal(5,2) storage bound, so an
  // overflowing value is a 400 instead of a DB error (500).
  // The cross-field rule (false requires a percentage, true discards it) lives in RutaPasadaService.
  toleranciaPorDefecto: z.boolean().optional(),
  toleranciaPct: z
    .number()
    .min(0)
    .max(999.99)
    .refine((v) => Math.round(v * 100) / 100 === v, {
      message: 'toleranciaPct must have at most 2 decimal places',
    })
    .nullable()
    .optional(),
  // Magnitude the etapa measures. Label only: weights stay in kg (1 kg = 1 L). Omitted means 'peso' on a new etapa.
  magnitud: z.enum(MAGNITUDES).optional(),
  // Manual qualities of the etapa. Omitted on update keeps the stored ones; an array replaces them (missing ones are deactivated).
  atributos: z.array(AtributoEtapaRutaInputSchema).max(MAX_ATRIBUTOS_POR_ETAPA).optional(),
});

export const RutaPasadaEtapaUpdateSchema = RutaPasadaEtapaCreateSchema.partial();

// ─── ArticuloRutaPasada ───────────────────────────────────────────────────────

export const ArticuloRutaPasadaCreateSchema = z.object({
  rutaPasada: z.number().int().positive(),
  articulo: z.number().int().positive(),
});

export const ArticuloRutaPasadaUpdateSchema = ArticuloRutaPasadaCreateSchema.partial();

// ─── Pasada ───────────────────────────────────────────────────────────────────

export const PasadaIniciarSchema = z.object({
  lineaProduccionId: z.number().int().positive(),
  idBalanza: z.number().int().positive(),
  observacion: z.string().min(1).optional(),
  // Start the verification route (standard weights) instead of the line's active route.
  verificacion: z.boolean().optional(),
  // Which verification route to run (the articulo with code 0 can have several). Only valid together
  // with `verificacion: true`; without it the lowest-id verification route is used.
  rutaPasadaId: z.number().int().positive().optional(),
}).refine((data) => data.rutaPasadaId === undefined || data.verificacion === true, {
  message: 'rutaPasadaId solo se puede enviar junto con verificacion: true',
  path: ['rutaPasadaId'],
});

export const PasadaLineaParadaSchema = z.object({
  lineaProduccionId: z.number().int().positive(),
  observacion: z.string().trim().min(1, 'La observación es obligatoria'),
  idBalanza: z.number().int().positive().optional(),
});

export const PasadaUpdateSchema = z.object({
  action: z.enum(['completar', 'abortar']).optional(),
  motivoCierre: z.string().min(1).optional(),
  observacionCierre: z.string().min(1).nullable().optional(),
  observacion: z.string().min(1).nullable().optional(),
}).refine(
  (data) => data.action !== 'abortar' || (data.motivoCierre?.trim()?.length ?? 0) > 0,
  { message: 'motivoCierre is required to abort a pasada', path: ['motivoCierre'] }
);

// ─── Muestra ──────────────────────────────────────────────────────────────────

export const MuestraRegistrarSchema = z.object({
  etapaId: z.number().int().positive(),
  lineaProduccionId: z.number().int().positive(),
  pesoNeto: z.number().positive(),
  pasadaId: z.number().int().positive().optional(),
  observacion: z.string().min(1).optional(),
});

// Manual qualities loaded by the operator once the samples of a stage are done. Out-of-range values are accepted
// (the range check is non-blocking); the per-tipo rules ('aceptado' is 0 or 1) live in ValorAtributoService.
export const ValorAtributoRegistrarSchema = z.object({
  pasadaId: z.number().int().positive(),
  etapaId: z.number().int().positive(),
  valores: z
    .array(
      z.object({
        atributoId: z.number().int().positive(),
        valor: z.number().finite().min(-99999999).max(99999999),
      }),
    )
    .min(1)
    .max(MAX_ATRIBUTOS_POR_ETAPA),
});

export const MuestraUpdateSchema = z.object({
  pesoNeto: z.number().positive().optional(),
  observacion: z.string().min(1).nullable().optional(),
});

// ─── Tolerancia (config global) ───────────────────────────────────────────────

// The max is a technical storage bound for the decimal(8,2) column, NOT a
// business cap: SC-001 product decision is that the backend imposes no upper
// limit on tolerance (the 0-50 range is enforced by the UI only). Without it,
// an overflowing value would surface as a DB error (500) instead of a 400.
// At most 2 decimals: decimal(8,2) would otherwise round silently and the
// PUT response would differ from a later GET. Float-safe check (no `% 0.01`).
export const ToleranciaConfigUpdateSchema = z.object({
  toleranciaPct: z
    .number()
    .min(0)
    .max(999999.99)
    .refine((v) => Math.round(v * 100) / 100 === v, {
      message: 'toleranciaPct must have at most 2 decimal places',
    }),
});
