import { UsuarioRol } from '../shared/types.js';

export interface SesionActiva {
  lineaProduccionId: number;
  usuarioId: number | null;
  usuarioRol: UsuarioRol | null;
  pasadaId: number | null;
  connectedAt: Date;
  ultimaActividadAt: Date | null;
  /**
   * Whether the pre-expiry warning (sesion-expirando) has already been
   * emitted for the current inactivity window. Reset to false whenever
   * actividad is refreshed, so a re-warn fires on the next idle stretch.
   */
  warningSent: boolean;
}

export interface SesionEnriquecida {
  lineaId: number;
  lineaNombre: string;
  usuarioId: number | null;
  usuarioNombre: string;
  legajo: string;
  fechaInicio: string;
  expiraEn: string | null;
}

export type IniciarSesionResult =
  | { ok: true; session: SesionActiva }
  | { ok: false; conflict: { lineaProduccionId: number } };

export type InactivityCloseCallback = (lineaProduccionId: number) => void;
export type InactivityWarningCallback = (lineaProduccionId: number) => void;

const DEFAULT_INACTIVITY_MS = 5 * 60 * 1000;
const INACTIVITY_WARNING_LEAD_MS = 30 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 3 * 60 * 1000;

export class SesionService {
  private static instance: SesionService;
  private lineSessions = new Map<number, SesionActiva>();    
  private failedAttempts = new Map<string, number>();        
  private lockExpires = new Map<string, Date>();             
  private inactivityCloseCallback: InactivityCloseCallback | null = null;
  private inactivityWarningCallback: InactivityWarningCallback | null = null;

  private constructor() {}

  public static getInstance(): SesionService {
    if (!SesionService.instance) {
      SesionService.instance = new SesionService();
    }
    return SesionService.instance;
  }

  /**
   * Configurable inactivity timeout, parsed from
   * `INACTIVITY_TIMEOUT_MINUTES` (integer minutes). Falls back to 5 minutes
   * when the var is missing or invalid (non-numeric, zero, or negative).
   *
   * Read lazily on each call rather than captured at construction so that
   * the value always reflects the current environment — the SesionService
   * is a process-wide singleton that outlives any single config reload.
   */
  public getInactivityTimeoutMs(): number {
    const raw = process.env.INACTIVITY_TIMEOUT_MINUTES;
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0
      ? parsed * 60 * 1000
      : DEFAULT_INACTIVITY_MS;
  }

  /** Pre-expiry warning lead time (ms before full timeout). */
  public getInactivityWarningLeadMs(): number {
    return INACTIVITY_WARNING_LEAD_MS;
  }

  setInactivityCloseCallback(cb: InactivityCloseCallback | null): void {
    this.inactivityCloseCallback = cb;
  }

  setInactivityWarningCallback(cb: InactivityWarningCallback | null): void {
    this.inactivityWarningCallback = cb;
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
      warningSent: false,
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

    if (session.usuarioId !== null && session.ultimaActividadAt) {
      const elapsed = Date.now() - session.ultimaActividadAt.getTime();
      const timeout = this.getInactivityTimeoutMs();

      if (elapsed > timeout) {
        // Inactivity expired: DELETE the session — no zombie entry with a
        // null user that the admin dashboard would show as "Unknown". The
        // operator must re-authenticate.
        this.lineSessions.delete(lineaProduccionId);
        this.inactivityCloseCallback?.(lineaProduccionId);
        return null;
      }

      // Pre-expiry warning window (timeout − lead). Fire the warning at most
      // once per inactivity stretch; actualizarActividad resets the gate so a
      // subsequent idle period re-warns.
      const warningThreshold = timeout - this.getInactivityWarningLeadMs();
      if (elapsed >= warningThreshold && !session.warningSent) {
        session.warningSent = true;
        this.inactivityWarningCallback?.(lineaProduccionId);
      }
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

  /**
   * Periodic check: iterates all active sessions and triggers warning/close
   * callbacks when inactivity thresholds are crossed. Called every ~10 seconds
   * from the socket layer so that idle sessions (no balanza or admin queries)
   * still fire their expiry events on time.
   */
  verificarInactividad(): void {
    const now = Date.now();
    const timeoutMs = this.getInactivityTimeoutMs();
    const warningLeadMs = this.getInactivityWarningLeadMs();

    for (const session of this.lineSessions.values()) {
      if (
        session.usuarioId === null ||
        !session.ultimaActividadAt ||
        session.ultimaActividadAt === null
      ) {
        continue;
      }

      const idleMs = now - session.ultimaActividadAt.getTime();

      if (idleMs >= timeoutMs) {
        // Full timeout: close and emit
        if (this.inactivityCloseCallback) {
          this.inactivityCloseCallback(session.lineaProduccionId);
        }
        this.lineSessions.delete(session.lineaProduccionId);
      } else if (
        idleMs >= timeoutMs - warningLeadMs &&
        !session.warningSent &&
        this.inactivityWarningCallback
      ) {
        // Pre-expiry warning
        this.inactivityWarningCallback(session.lineaProduccionId);
        session.warningSent = true;
      }
    }
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
      session.warningSent = false;
      console.log(`[Sesión] Actividad renovada para línea ${lineaProduccionId}. Timeout reiniciado.`);
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

  async enriquecerSesiones(): Promise<SesionEnriquecida[]> {
    const activeSessions = this.obtenerTodasLasSesiones();
    const core = await import('@mikro-orm/core');
    const em = core.RequestContext.getEntityManager();
    if (!em) throw new Error('No EntityManager in RequestContext');

    const UsuarioEntity = await import('../models/Usuario.js').then(m => m.Usuario);
    const LineaProduccionEntity = await import('../models/LineaProduccion.js').then(m => m.LineaProduccion);

    return await Promise.all(
      activeSessions.map(async (session) => {
        let usuarioNombre = 'Unknown';
        let lineaNombre = 'Unknown';
        let legajo = '-';

        if (session.usuarioId) {
          const usuario = await em.findOne(UsuarioEntity, { id: session.usuarioId });
          if (usuario) {
            usuarioNombre = usuario.nombreUsuario;
            legajo = usuario.legajo;
          }
        }

        const linea = await em.findOne(LineaProduccionEntity, { id: session.lineaProduccionId });
        if (linea) lineaNombre = linea.nombre;

        return {
          lineaId: session.lineaProduccionId,
          lineaNombre,
          usuarioId: session.usuarioId,
          usuarioNombre,
          legajo,
          fechaInicio: session.connectedAt.toISOString(),
          expiraEn: session.ultimaActividadAt ? new Date(session.ultimaActividadAt.getTime() + this.getInactivityTimeoutMs()).toISOString() : null,
        };
      })
    );
  }
}

export const sesionService = SesionService.getInstance();
