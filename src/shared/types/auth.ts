import type { UsuarioRol, SectorUsuario } from '../types.js';

export interface User {
  id: number;
  legajo: string;
  nombreUsuario: string;
  rol: UsuarioRol;
  puedeTomarMuestrasLibres: boolean;
  sector?: SectorUsuario | null;
}

export interface SesionActiva {
  lineaProduccionId: number;
  usuarioId: number | null;
  usuarioRol: UsuarioRol | null;
  ultimaActividadAt: string | null;
}

export interface SesionActivaAdmin {
  lineaId: number;
  lineaNombre: string;
  usuarioId: number | null;
  fechaInicio: string;
  expiraEn: string | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}
