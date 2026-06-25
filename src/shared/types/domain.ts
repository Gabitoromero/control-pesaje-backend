import type { UsuarioRol } from '../types.js';

// ─── Primitive types ──────────────────────────────────────────────────────────

export type EstadoValidacion = 'ok' | 'fuera_de_rango' | 'descartado';
export type EstadoPasada = 'en_curso' | 'completa' | 'abortada';

// ─── Shared detail shapes (used as nested objects in API responses) ───────────

/** Inline etapa reference returned inside RutaPasadaEtapa */
export interface EtapaDetalle {
  id: number;
  nombre: string;
}

/** Inline articulo reference returned inside Pasada responses */
export interface ArticuloDetalle {
  id: number;
  nombre: string;
  marca?: string;
  descripcion?: string;
  activo?: boolean;
}

/** Inline linea reference returned inside Pasada responses */
export interface LineaDetalle {
  id: number;
  nombre?: string;
}

/** Inline usuario reference returned inside Pasada responses */
export interface UsuarioDetalle {
  id: number;
  nombreUsuario?: string;
  nombreApellido?: string;
  legajo?: string;
}

// ─── Core entities ────────────────────────────────────────────────────────────

export interface Usuario {
  id?: number;
  nombreApellido: string;
  nombreUsuario: string;
  legajo: string;
  rol: UsuarioRol;
  activo?: boolean;
  puedeTomarMuestrasLibres?: boolean;
  pin?: string;
}

export interface Etapa {
  id?: number;
  nombre: string;
  descripcion?: string | null;
  activo?: boolean;
}

export interface Muestra {
  id?: number;
  pesoNeto: number;
  estadoValidacion: EstadoValidacion;
  usuarioId: number;
  etapaId: number;
  lineaProduccionId: number;
  articuloId?: number;
  timestamp: string | Date;
}

// ─── Ruta de pasada ───────────────────────────────────────────────────────────

/**
 * Shape the backend returns for each stage inside a ruta.
 * The backend populates `etapa` as a nested object with `{ id, nombre }`.
 */
export interface RutaPasadaEtapa {
  id?: number;
  etapa: EtapaDetalle;
  orden: number;
  pesoMinimo: number;
  pesoIdeal: number;
  pesoMaximo: number;
  cantidadMuestrasRequeridas: number;
}

/** Used when creating or updating a ruta — etapa is sent as an ID */
export interface RutaPasadaEtapaCreate {
  id?: number;
  etapa: number;
  orden: number;
  pesoMinimo: number;
  pesoIdeal: number;
  pesoMaximo: number;
  cantidadMuestrasRequeridas: number;
}

export interface Ruta {
  id?: number;
  nombre: string;
  descripcion?: string | null;
  activo?: boolean;
  etapas?: RutaPasadaEtapa[];
}

export interface RutaCreate extends Omit<Ruta, 'id' | 'etapas'> {
  etapas: RutaPasadaEtapaCreate[];
}

export type RutaUpdate = Partial<Omit<RutaCreate, 'etapas'>> & {
  etapas?: RutaPasadaEtapaCreate[];
  activo?: boolean;
};

// ─── Pasada ───────────────────────────────────────────────────────────────────

/**
 * Shape returned by GET /api/pasadas and GET /api/pasadas/:id.
 * The backend may populate nested relations (articulo, usuario, lineaProduccion).
 */
export interface Pasada {
  id: number;
  lineaProduccionId?: number;
  usuarioId?: number;
  estado: EstadoPasada;
  articuloId?: number;
  createdAt?: string;
  updatedAt?: string;
  horaInicio?: string;
  horaCierre?: string;
  numero?: number;
  // Nested relations the backend populates on eager load
  articulo?: ArticuloDetalle;
  usuario?: UsuarioDetalle;
  lineaProduccion?: LineaDetalle;
  muestras?: Muestra[];
}

// ─── RutaPasada (legacy alias kept for backwards compat) ─────────────────────
/** @deprecated Use Ruta instead */
export interface RutaPasada {
  id?: number;
  nombre: string;
  descripcion?: string | null;
  activo?: boolean;
  etapas?: RutaPasadaEtapa[];
}
