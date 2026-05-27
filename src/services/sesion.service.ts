export interface ActiveSession {
  lineaProduccionId: number;
  usuarioId: number;
  articuloId: number;
  pasadaId: number | null;
  connectedAt: Date;
}

export class SesionService {
  private static instance: SesionService;
  private sessions = new Map<number, ActiveSession>(); // Key: lineaProduccionId

  private constructor() {}

  public static getInstance(): SesionService {
    if (!SesionService.instance) {
      SesionService.instance = new SesionService();
    }
    return SesionService.instance;
  }

  iniciarSesion(lineaProduccionId: number, usuarioId: number, articuloId: number): ActiveSession {
    // Enforce single active session per operator
    for (const [lineId, session] of this.sessions.entries()) {
      if (session.usuarioId === usuarioId) {
        this.sessions.delete(lineId);
      }
    }

    const session: ActiveSession = {
      lineaProduccionId,
      usuarioId,
      articuloId,
      pasadaId: null,
      connectedAt: new Date()
    };

    this.sessions.set(lineaProduccionId, session);
    return session;
  }

  cerrarSesion(lineaProduccionId: number): boolean {
    return this.sessions.delete(lineaProduccionId);
  }

  obtenerSesion(lineaProduccionId: number): ActiveSession | undefined {
    return this.sessions.get(lineaProduccionId);
  }

  obtenerSesionPorUsuario(usuarioId: number): ActiveSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.usuarioId === usuarioId) {
        return session;
      }
    }
    return undefined;
  }

  actualizarPasada(lineaProduccionId: number, pasadaId: number | null): void {
    const session = this.sessions.get(lineaProduccionId);
    if (session) {
      session.pasadaId = pasadaId;
    }
  }

  limpiar(): void {
    this.sessions.clear();
  }
}

export const sesionService = SesionService.getInstance();
