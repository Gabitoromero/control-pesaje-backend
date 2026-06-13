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
  nombre: z.string().min(1),
  descripcion: z.string().min(4).optional(),
  activo: z.boolean().optional(),
});

export const ArticuloUpdateSchema = ArticuloCreateSchema.partial();

// ─── Etapa ────────────────────────────────────────────────────────────────────

export const EtapaCreateSchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().min(4).optional(),
  activo: z.boolean().optional(),
});

export const EtapaUpdateSchema = EtapaCreateSchema.partial();

// ─── LineaProduccion ──────────────────────────────────────────────────────────

export const LineaProduccionCreateSchema = z.object({
  nombre: z.string().min(1),
  numeroBalanza: z.number().int().positive(),
  activo: z.boolean().optional(),
});

export const LineaProduccionUpdateSchema = LineaProduccionCreateSchema.partial();

// ─── RutaPasada ───────────────────────────────────────────────────────────────

export const RutaPasadaCreateSchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().optional(),
  activo: z.boolean().optional(),
});

export const RutaPasadaUpdateSchema = RutaPasadaCreateSchema.partial();

// ─── RutaPasadaEtapa ──────────────────────────────────────────────────────────

export const RutaPasadaEtapaCreateSchema = z.object({
  articulo: z.number().int().positive(),
  etapa: z.number().int().positive(),
  orden: z.number().int(),
  pesoIdeal: z.number().positive(),
  pesoMinimo: z.number().positive(),
  pesoMaximo: z.number().positive(),
  cantidadMuestrasRequeridas: z.number().int().positive(),
  activo: z.boolean().optional(),
});

export const RutaPasadaEtapaUpdateSchema = RutaPasadaEtapaCreateSchema.partial();
