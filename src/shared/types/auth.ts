import type { UsuarioRolType } from '../types';

export interface User {
  id: number;
  nombreUsuario: string;
  rol: UsuarioRolType;
  lineaId?: number;
}

export interface AuthResponse {
  token: string;
  user: User;
}
