export interface SesionActiva {
  lineaProduccionId: number;
  usuarioIdGlobal: number;
  usuarioIdOperario: number | null;
  pasadaId: number | null;
  connectedAt: Date;
  operarioUltimaActividadAt: Date | null;
}

export type IniciarSesionResult =
  | { ok: true; session: SesionActiva }
  | { ok: false; conflict: { lineaProduccionId: number } };

export class SesionService {
  private static instance: SesionService;
  private sessions = new Map<number, SesionActiva>(); // Key: lineaProduccionId
  private failedAttempts = new Map<number, number>(); // Key: lineaProduccionId
  private lockExpires = new Map<number, Date>(); // Key: lineaProduccionId

  private constructor() {}

  public static getInstance(): SesionService {
    if (!SesionService.instance) {
      SesionService.instance = new SesionService();
    }
    return SesionService.instance;
  }

  iniciarSesion(
    lineaProduccionId: number,
    usuarioIdGlobal: number,
    usuarioIdOperario: number | null = null
  ): IniciarSesionResult {
    const opId = usuarioIdOperario ?? usuarioIdGlobal;

    for (const [lineId, session] of this.sessions.entries()) {
      if (session.usuarioIdOperario === opId && lineId !== lineaProduccionId) {
        return { ok: false, conflict: { lineaProduccionId: lineId } };
      }
    }

    const session: SesionActiva = {
      lineaProduccionId,
      usuarioIdGlobal,
      usuarioIdOperario: opId,
      pasadaId: null,
      connectedAt: new Date(),
      operarioUltimaActividadAt: new Date(),
    };

    this.sessions.set(lineaProduccionId, session);
    this.resetearIntentos(lineaProduccionId);

    return { ok: true, session };
  }

  cerrarSesion(lineaProduccionId: number): boolean {
    return this.sessions.delete(lineaProduccionId);
  }

  obtenerSesion(lineaProduccionId: number): SesionActiva | undefined {
    const session = this.sessions.get(lineaProduccionId);
    if (session && session.usuarioIdOperario !== null && session.operarioUltimaActividadAt) {
      if (Date.now() - session.operarioUltimaActividadAt.getTime() > 5 * 60 * 1000) {
        session.usuarioIdOperario = null;
        session.operarioUltimaActividadAt = null;
      }
    }
    return session;
  }

  obtenerSesionPorUsuario(usuarioId: number): SesionActiva | undefined {
    for (const [lineId, session] of this.sessions.entries()) {
      // Apply timeout on the session first
      this.obtenerSesion(lineId);
      if (session.usuarioIdOperario === usuarioId) {
        return session;
      }
    }
    return undefined;
  }

  actualizarPasada(lineaProduccionId: number, pasadaId: number | null): void {
    const session = this.sessions.get(lineaProduccionId);
    if (session) {
      session.pasadaId = pasadaId;
      // Any pasada update (start/complete) counts as operator activity
      this.actualizarActividad(lineaProduccionId);
    }
  }

  actualizarActividad(lineaProduccionId: number): void {
    const session = this.sessions.get(lineaProduccionId);
    if (session && session.usuarioIdOperario !== null) {
      session.operarioUltimaActividadAt = new Date();
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
    this.sessions.clear();
    this.failedAttempts.clear();
    this.lockExpires.clear();
  }
}

export const sesionService = SesionService.getInstance();

