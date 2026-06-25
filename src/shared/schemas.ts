import { z } from 'zod';
import { UsuarioRol } from './types.js';

// ─── Usuario ─────────────────────────────────────────────────────────────────

export const UsuarioCreateSchema = z.object({
  nombreApellido: z.string().min(1),
  nombreUsuario: z.string().min(3),
  legajo: z.string().min(1),
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
  marca: z.string().min(1),
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

// ─── LineaProduccion ──────────────────────────────────────────────────────────

export const LineaProduccionCreateSchema = z.object({
  nombre: z.string().min(1),
  numeroBalanza: z.number().int().positive(),
  rutaPasadaActiva: z.number().int().positive().nullable().optional(),
  activo: z.boolean().optional(),
});

export const LineaProduccionUpdateSchema = LineaProduccionCreateSchema.partial();

// ─── RutaPasada ───────────────────────────────────────────────────────────────

export const RutaPasadaCreateSchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().min(4).nullable().optional(),
  activo: z.boolean().optional(),
  etapas: z.array(z.lazy(() => RutaPasadaEtapaCreateSchema.omit({ rutaPasada: true }))).optional(),
});

export const RutaPasadaUpdateSchema = RutaPasadaCreateSchema.partial();

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
});

export const RutaPasadaEtapaUpdateSchema = RutaPasadaEtapaCreateSchema.partial();

// ─── Pasada ───────────────────────────────────────────────────────────────────

export const PasadaIniciarSchema = z.object({
  lineaProduccionId: z.number().int().positive(),
  // articuloId is required — service contract requires it (see design TD-02)
  articuloId: z.number().int().positive(),
});

export const PasadaUpdateSchema = z.object({
  action: z.enum(['completar', 'abortar']).optional(),
  motivoCierre: z.string().min(1).optional(),
  observacionCierre: z.string().min(1).nullable().optional(),
}).refine(
  (data) => data.action !== 'abortar' || (data.motivoCierre?.trim()?.length ?? 0) > 0,
  { message: 'motivoCierre is required to abort a pasada', path: ['motivoCierre'] }
);

// ─── Muestra ──────────────────────────────────────────────────────────────────

export const MuestraRegistrarSchema = z.object({
  etapaId: z.number().int().positive(),
  lineaProduccionId: z.number().int().positive(),
  pesoNeto: z.number().positive(),
  articuloId: z.number().int().positive().optional(),
  pasadaId: z.number().int().positive().optional(),
  observacion: z.string().min(1).optional(),
});

export const MuestraUpdateSchema = z.object({
  pesoNeto: z.number().positive().optional(),
  observacion: z.string().min(1).nullable().optional(),
});
