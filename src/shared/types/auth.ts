import type { UsuarioRol } from '../types.js';

export interface User {
  id: number;
  legajo: string;
  nombreUsuario: string;
  rol: UsuarioRol;
  puedeTomarMuestrasLibres: boolean;
}

export interface SesionActiva {
  lineaProduccionId: number;
  usuarioId: number | null;
  usuarioRol: UsuarioRol | null;
  ultimaActividadAt: string | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}
