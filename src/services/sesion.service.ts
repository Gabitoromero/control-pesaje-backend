import { UsuarioRol } from '../shared/types.js';

export interface SesionActiva {
  lineaProduccionId: number;
  usuarioId: number | null;
  usuarioRol: UsuarioRol | null;
  pasadaId: number | null;
  connectedAt: Date;
  ultimaActividadAt: Date | null;
}

export type IniciarSesionResult =
  | { ok: true; session: SesionActiva }
  | { ok: false; conflict: { lineaProduccionId: number } };

const INACTIVITY_MS = 5 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 3 * 60 * 1000;

export class SesionService {
  private static instance: SesionService;
  private lineSessions = new Map<number, SesionActiva>();    
  private failedAttempts = new Map<string, number>();        
  private lockExpires = new Map<string, Date>();             

  private constructor() {}

  public static getInstance(): SesionService {
    if (!SesionService.instance) {
      SesionService.instance = new SesionService();
    }
    return SesionService.instance;
  }

  iniciarSesion(
    lineaProduccionId: number,
    usuarioId: number,
    usuarioRol: UsuarioRol
  ): IniciarSesionResult {
    // enforce one active session per user across lines
    for (const [lineId, session] of this.lineSessions.entries()) {
      if (session.usuarioId === usuarioId && lineId !== lineaProduccionId) {
        return { ok: false, conflict: { lineaProduccionId: lineId } };
      }
    }

    const session: SesionActiva = {
      lineaProduccionId,
      usuarioId,
      usuarioRol,
      pasadaId: null,
      connectedAt: new Date(),
      ultimaActividadAt: new Date(),
    };

    this.lineSessions.set(lineaProduccionId, session);
    return { ok: true, session };
  }

  cerrarSesion(lineaProduccionId: number): boolean {
    return this.lineSessions.delete(lineaProduccionId);
  }

  obtenerSesion(lineaProduccionId: number): SesionActiva | null {
    const session = this.lineSessions.get(lineaProduccionId);
    if (!session) return null;

    if (
      session.usuarioId !== null &&
      session.ultimaActividadAt &&
      (session.usuarioRol === UsuarioRol.OPERARIO || session.usuarioRol === UsuarioRol.JEFE) &&
      Date.now() - session.ultimaActividadAt.getTime() > INACTIVITY_MS
    ) {
      session.usuarioId = null;
      session.usuarioRol = null;
      session.ultimaActividadAt = null;
    }
    return session;
  }

  obtenerSesionPorUsuario(usuarioId: number): SesionActiva | null {
    for (const [lineId, session] of this.lineSessions.entries()) {
      this.obtenerSesion(lineId); // Trigger lazy expiry check
      if (session.usuarioId === usuarioId) {
        return session;
      }
    }
    return null;
  }

  obtenerTodasLasSesiones(): SesionActiva[] {
    // Return an array of all active sessions
    return Array.from(this.lineSessions.values());
  }

  actualizarPasada(lineaProduccionId: number, pasadaId: number | null): void {
    const session = this.lineSessions.get(lineaProduccionId);
    if (session) {
      session.pasadaId = pasadaId;
      this.actualizarActividad(lineaProduccionId);
    }
  }

  actualizarActividad(lineaProduccionId: number): void {
    const session = this.lineSessions.get(lineaProduccionId);
    if (session && session.usuarioId !== null) {
      session.ultimaActividadAt = new Date();
    }
  }

  registrarIntentoFallido(legajo: string): void {
    const attempts = (this.failedAttempts.get(legajo) ?? 0) + 1;
    this.failedAttempts.set(legajo, attempts);
    if (attempts >= LOGIN_MAX_ATTEMPTS) {
      this.lockExpires.set(legajo, new Date(Date.now() + LOGIN_LOCK_MS));
    }
  }

  estaBloqueada(legajo: string): boolean {
    const expires = this.lockExpires.get(legajo);
    if (!expires) return false;

    if (Date.now() >= expires.getTime()) {
      this.lockExpires.delete(legajo);
      this.failedAttempts.set(legajo, 0);
      return false;
    }

    return true;
  }

  resetearIntentos(legajo: string): void {
    this.failedAttempts.set(legajo, 0);
    this.lockExpires.delete(legajo);
  }

  limpiar(): void {
    this.lineSessions.clear();
    this.failedAttempts.clear();
    this.lockExpires.clear();
  }
}

export const sesionService = SesionService.getInstance();
