import { UsuarioRol } from '../shared/types.js';

export interface SesionActiva {
  lineaProduccionId: number | null;
  usuarioIdGlobal: number;
  usuarioIdUsuario: number | null;
  rolUsuario: UsuarioRol | null;
  pasadaId: number | null;
  connectedAt: Date;
  usuarioUltimaActividadAt: Date | null;
}

export type IniciarSesionResult =
  | { ok: true; session: SesionActiva }
  | { ok: false; conflict: { lineaProduccionId: number } };

const OPERATOR_INACTIVITY_MS = 5 * 60 * 1000;

export class SesionService {
  private static instance: SesionService;
  private lineSessions = new Map<number, SesionActiva>();    
  private globalSessions = new Map<number, SesionActiva>(); // key: usuarioIdGlobal
  private failedAttempts = new Map<number, number>();        
  private lockExpires = new Map<number, Date>();             

  private constructor() {}

  public static getInstance(): SesionService {
    if (!SesionService.instance) {
      SesionService.instance = new SesionService();
    }
    return SesionService.instance;
  }

  iniciarSesion(
    lineaProduccionId: number | null,
    usuarioIdGlobal: number,
    usuarioIdUsuario: number,
    rolUsuario: UsuarioRol
  ): IniciarSesionResult {
    if (lineaProduccionId !== null) {
      // Line-based session (operario): enforce one active session per user across lines
      for (const [lineId, session] of this.lineSessions.entries()) {
        if (session.usuarioIdUsuario === usuarioIdUsuario && lineId !== lineaProduccionId) {
          return { ok: false, conflict: { lineaProduccionId: lineId } };
        }
      }

      const session: SesionActiva = {
        lineaProduccionId,
        usuarioIdGlobal,
        usuarioIdUsuario,
        rolUsuario,
        pasadaId: null,
        connectedAt: new Date(),
        usuarioUltimaActividadAt: new Date(),
      };

      this.lineSessions.set(lineaProduccionId, session);
      this.resetearIntentos(lineaProduccionId);
      return { ok: true, session };
    }

    // Global session (jefe/admin): not tied to a line, replaces any existing global session for this user
    const session: SesionActiva = {
      lineaProduccionId: null,
      usuarioIdGlobal,
      usuarioIdUsuario,
      rolUsuario,
      pasadaId: null,
      connectedAt: new Date(),
      usuarioUltimaActividadAt: new Date(),
    };

    this.globalSessions.set(usuarioIdGlobal, session);
    return { ok: true, session };
  }

  cerrarSesion(lineaProduccionId: number): boolean {
    return this.lineSessions.delete(lineaProduccionId);
  }

  cerrarSesionGlobal(usuarioIdGlobal: number): boolean {
    return this.globalSessions.delete(usuarioIdGlobal);
  }

  obtenerSesion(lineaProduccionId: number): SesionActiva | undefined {
    const session = this.lineSessions.get(lineaProduccionId);
    if (
      session &&
      session.usuarioIdUsuario !== null &&
      session.usuarioUltimaActividadAt &&
      session.rolUsuario === UsuarioRol.OPERARIO &&
      Date.now() - session.usuarioUltimaActividadAt.getTime() > OPERATOR_INACTIVITY_MS
    ) {
      session.usuarioIdUsuario = null;
      session.rolUsuario = null;
      session.usuarioUltimaActividadAt = null;
    }
    return session;
  }

  obtenerSesionGlobal(usuarioIdGlobal: number): SesionActiva | undefined {
    return this.globalSessions.get(usuarioIdGlobal);
  }

  obtenerSesionPorUsuario(usuarioId: number): SesionActiva | undefined {
    for (const [lineId, session] of this.lineSessions.entries()) {
      this.obtenerSesion(lineId);
      if (session.usuarioIdUsuario === usuarioId) {
        return session;
      }
    }
    return undefined;
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
    if (session && session.usuarioIdUsuario !== null) {
      session.usuarioUltimaActividadAt = new Date();
    }
  }

  registrarIntentoFallido(lineaProduccionId: number): void {
    const attempts = (this.failedAttempts.get(lineaProduccionId) ?? 0) + 1;
    this.failedAttempts.set(lineaProduccionId, attempts);
    if (attempts >= 3) {
      this.lockExpires.set(lineaProduccionId, new Date(Date.now() + 5 * 60 * 1000));
    }
  }

  estaBloqueada(lineaProduccionId: number): boolean {
    const expires = this.lockExpires.get(lineaProduccionId);
    if (!expires) return false;

    if (Date.now() >= expires.getTime()) {
      this.lockExpires.delete(lineaProduccionId);
      this.failedAttempts.set(lineaProduccionId, 0);
      return false;
    }

    return true;
  }

  resetearIntentos(lineaProduccionId: number): void {
    this.failedAttempts.set(lineaProduccionId, 0);
    this.lockExpires.delete(lineaProduccionId);
  }

  limpiar(): void {
    this.lineSessions.clear();
    this.globalSessions.clear();
    this.failedAttempts.clear();
    this.lockExpires.clear();
  }
}

export const sesionService = SesionService.getInstance();
