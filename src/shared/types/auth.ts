import type { UsuarioRol } from '../types.js';

export interface User {
  id: number;
  nombreUsuario: string;
  rol: UsuarioRol;
  puedeTomarMuestrasLibres?: boolean;
  lineaId?: number;
}

export interface AuthResponse {
  token: string;
  user: User;
}
