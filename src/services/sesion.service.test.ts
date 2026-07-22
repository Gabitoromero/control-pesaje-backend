import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sesionService } from './sesion.service.js';
import { UsuarioRol } from '../shared/types.js';

describe('SesionService (In-Memory Session Registry)', () => {
  beforeEach(() => {
    sesionService.limpiar();
  });

  describe('iniciarSesion / obtenerSesion', () => {
    it('returns null when no session exists', () => {
      expect(sesionService.obtenerSesion(999)).toBeNull();
    });

    it('sets usuarioId, usuarioRol, ultimaActividadAt and omits old fields', () => {
      const result = sesionService.iniciarSesion(1, 10, UsuarioRol.OPERARIO);
      expect(result.ok).toBe(true);
      
      const { session } = result as Extract<typeof result, { ok: true }>;
      expect(session.lineaProduccionId).toBe(1);
      expect(session.usuarioId).toBe(10);
      expect(session.usuarioRol).toBe(UsuarioRol.OPERARIO);
      expect(session.ultimaActividadAt).toBeInstanceOf(Date);
      
      // old fields must not exist
      expect((session as any).usuarioIdGlobal).toBeUndefined();
      expect((session as any).usuarioIdUsuario).toBeUndefined();
      expect((session as any).rolUsuario).toBeUndefined();
      expect((session as any).usuarioUltimaActividadAt).toBeUndefined();

      const retrieved = sesionService.obtenerSesion(1);
      expect(retrieved).toEqual(session);
    });
  });

  describe('Lazy expiry (5 min)', () => {
    // Inactivity expiry now DELETES the session (no zombie entry with a null
    // user). ObtenerSesion returns null and the registry no longer holds the
    // line — the operator must re-authenticate and the admin dashboard never
    // shows a stale "Unknown" session.
    const originalEnv = process.env.INACTIVITY_TIMEOUT_MINUTES;

    beforeEach(() => {
      delete process.env.INACTIVITY_TIMEOUT_MINUTES; // default 5 min
    });

    afterEach(() => {
      if (originalEnv === undefined) delete process.env.INACTIVITY_TIMEOUT_MINUTES;
      else process.env.INACTIVITY_TIMEOUT_MINUTES = originalEnv;
    });

    it('deletes the session after 5+ min for operario', () => {
      vi.useFakeTimers();
      const now = new Date('2026-06-01T12:00:00Z');
      vi.setSystemTime(now);

      sesionService.iniciarSesion(1, 10, UsuarioRol.OPERARIO);

      vi.setSystemTime(new Date(now.getTime() + 6 * 60 * 1000));

      const retrieved = sesionService.obtenerSesion(1);
      expect(retrieved).toBeNull();
      expect(sesionService.obtenerTodasLasSesiones()).toHaveLength(0);

      vi.useRealTimers();
    });

    it('deletes the session after 5+ min for jefe', () => {
      vi.useFakeTimers();
      const now = new Date('2026-06-01T12:00:00Z');
      vi.setSystemTime(now);

      sesionService.iniciarSesion(1, 20, UsuarioRol.JEFE);

      vi.setSystemTime(new Date(now.getTime() + 6 * 60 * 1000));

      const retrieved = sesionService.obtenerSesion(1);
      expect(retrieved).toBeNull();
      expect(sesionService.obtenerTodasLasSesiones()).toHaveLength(0);

      vi.useRealTimers();
    });

    it('deletes the session after 5+ min for administrador', () => {
      vi.useFakeTimers();
      const now = new Date('2026-06-01T12:00:00Z');
      vi.setSystemTime(now);

      sesionService.iniciarSesion(1, 30, UsuarioRol.ADMINISTRADOR);

      vi.setSystemTime(new Date(now.getTime() + 6 * 60 * 1000));

      const retrieved = sesionService.obtenerSesion(1);
      expect(retrieved).toBeNull();
      expect(sesionService.obtenerTodasLasSesiones()).toHaveLength(0);

      vi.useRealTimers();
    });
  });

  describe('Rate Limiter by Legajo', () => {
    it('blocks after 5 failed attempts', () => {
      const legajo = 'EMP01';
      expect(sesionService.estaBloqueada(legajo)).toBe(false);

      for (let i = 0; i < 5; i++) {
        sesionService.registrarIntentoFallido(legajo);
      }
      
      expect(sesionService.estaBloqueada(legajo)).toBe(true);
    });

    it('remains blocked on 6th attempt within window', () => {
      const legajo = 'EMP02';
      for (let i = 0; i < 6; i++) {
        sesionService.registrarIntentoFallido(legajo);
      }
      expect(sesionService.estaBloqueada(legajo)).toBe(true);
    });

    it('unblocks after lock expires (3 min)', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const legajo = 'EMP03';
      for (let i = 0; i < 5; i++) {
        sesionService.registrarIntentoFallido(legajo);
      }
      expect(sesionService.estaBloqueada(legajo)).toBe(true);

      vi.setSystemTime(now + 4 * 60 * 1000); // 4 minutes later
      expect(sesionService.estaBloqueada(legajo)).toBe(false);

      vi.useRealTimers();
    });

    it('resets attempts on resetearIntentos', () => {
      const legajo = 'EMP04';
      sesionService.registrarIntentoFallido(legajo);
      sesionService.registrarIntentoFallido(legajo);
      sesionService.registrarIntentoFallido(legajo); // 3 failures
      
      expect(sesionService.estaBloqueada(legajo)).toBe(false);
      
      sesionService.resetearIntentos(legajo);
      
      // another 3 shouldn't block, because we reset
      sesionService.registrarIntentoFallido(legajo);
      sesionService.registrarIntentoFallido(legajo);
      sesionService.registrarIntentoFallido(legajo);
      expect(sesionService.estaBloqueada(legajo)).toBe(false);
    });
  });

  describe('obtenerTodasLasSesiones', () => {
    it('returns an array of all active sessions', () => {
      sesionService.iniciarSesion(1, 10, UsuarioRol.OPERARIO);
      sesionService.iniciarSesion(2, 20, UsuarioRol.JEFE);

      const sesiones = sesionService.obtenerTodasLasSesiones();
      expect(sesiones.length).toBe(2);
      expect(sesiones.some(s => s.lineaProduccionId === 1 && s.usuarioId === 10)).toBe(true);
      expect(sesiones.some(s => s.lineaProduccionId === 2 && s.usuarioId === 20)).toBe(true);
    });
  });

  describe('Inactivity timeout configuration (env parsing)', () => {
    const originalEnv = process.env.INACTIVITY_TIMEOUT_MINUTES;

    afterEach(() => {
      if (originalEnv === undefined) delete process.env.INACTIVITY_TIMEOUT_MINUTES;
      else process.env.INACTIVITY_TIMEOUT_MINUTES = originalEnv;
    });

    it('parses INACTIVITY_TIMEOUT_MINUTES env var into minutes', () => {
      process.env.INACTIVITY_TIMEOUT_MINUTES = '10';
      expect(sesionService.getInactivityTimeoutMs()).toBe(10 * 60 * 1000);
    });

    it('falls back to 5 minutes when the env var is missing', () => {
      delete process.env.INACTIVITY_TIMEOUT_MINUTES;
      expect(sesionService.getInactivityTimeoutMs()).toBe(5 * 60 * 1000);
    });

    it('falls back to 5 minutes when the env var is invalid', () => {
      process.env.INACTIVITY_TIMEOUT_MINUTES = 'not-a-number';
      expect(sesionService.getInactivityTimeoutMs()).toBe(5 * 60 * 1000);
    });

    it('falls back to 5 minutes when the env var is zero or negative', () => {
      process.env.INACTIVITY_TIMEOUT_MINUTES = '0';
      expect(sesionService.getInactivityTimeoutMs()).toBe(5 * 60 * 1000);
      process.env.INACTIVITY_TIMEOUT_MINUTES = '-3';
      expect(sesionService.getInactivityTimeoutMs()).toBe(5 * 60 * 1000);
    });
  });

  describe('Inactivity callbacks', () => {
    it('setInactivityCloseCallback stores a callback without throwing', () => {
      const cb = vi.fn();
      expect(() => sesionService.setInactivityCloseCallback(cb)).not.toThrow();
    });

    it('setInactivityWarningCallback stores a callback without throwing', () => {
      const cb = vi.fn();
      expect(() => sesionService.setInactivityWarningCallback(cb)).not.toThrow();
    });

    it('callbacks can be cleared by passing null', () => {
      sesionService.setInactivityCloseCallback(vi.fn());
      expect(() => sesionService.setInactivityCloseCallback(null)).not.toThrow();
      sesionService.setInactivityWarningCallback(vi.fn());
      expect(() => sesionService.setInactivityWarningCallback(null)).not.toThrow();
    });
  });

  describe('warningSent field on SesionActiva', () => {
    it('initializes warningSent=false on a new session', () => {
      const result = sesionService.iniciarSesion(1, 10, UsuarioRol.OPERARIO);
      const { session } = result as Extract<typeof result, { ok: true }>;
      expect(session.warningSent).toBe(false);
    });
  });

  describe('obtenerSesion inactivity expiry (delete + callbacks)', () => {
    const originalEnv = process.env.INACTIVITY_TIMEOUT_MINUTES;

    beforeEach(() => {
      sesionService.limpiar();
      sesionService.setInactivityCloseCallback(null);
      sesionService.setInactivityWarningCallback(null);
      // Force a small, deterministic timeout (1 minute) so warning lead is 30s.
      process.env.INACTIVITY_TIMEOUT_MINUTES = '1';
    });

    afterEach(() => {
      sesionService.setInactivityCloseCallback(null);
      sesionService.setInactivityWarningCallback(null);
      if (originalEnv === undefined) delete process.env.INACTIVITY_TIMEOUT_MINUTES;
      else process.env.INACTIVITY_TIMEOUT_MINUTES = originalEnv;
      vi.useRealTimers();
    });

    it('deletes the session and calls the close callback on expiry', () => {
      vi.useFakeTimers();
      const now = new Date('2026-06-01T12:00:00Z');
      vi.setSystemTime(now);

      sesionService.iniciarSesion(1, 10, UsuarioRol.OPERARIO);

      const closeCb = vi.fn();
      sesionService.setInactivityCloseCallback(closeCb);

      // 2 minutes: past the 1-minute timeout → expired
      vi.setSystemTime(new Date(now.getTime() + 2 * 60 * 1000));

      const retrieved = sesionService.obtenerSesion(1);
      expect(retrieved).toBeNull();
      expect(closeCb).toHaveBeenCalledWith(1);
      // session is gone from the registry, not a zombie
      expect(sesionService.obtenerTodasLasSesiones()).toHaveLength(0);
    });

    it('fires the warning callback once at T-30s and keeps the session alive', () => {
      vi.useFakeTimers();
      const now = new Date('2026-06-01T12:00:00Z');
      vi.setSystemTime(now);

      sesionService.iniciarSesion(1, 11, UsuarioRol.OPERARIO);

      const warningCb = vi.fn();
      sesionService.setInactivityWarningCallback(warningCb);

      // 35s elapsed: within the 30s lead of a 60s timeout → warning fires,
      // session still alive.
      vi.setSystemTime(new Date(now.getTime() + 35 * 1000));
      const retrieved = sesionService.obtenerSesion(1);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.usuarioId).toBe(11);
      expect(warningCb).toHaveBeenCalledWith(1);

      // Calling again must NOT re-warn (warningSent gating)
      warningCb.mockClear();
      const retrieved2 = sesionService.obtenerSesion(1);
      expect(retrieved2).not.toBeNull();
      expect(warningCb).not.toHaveBeenCalled();
    });

    it('does not fire the warning when no callback is registered', () => {
      vi.useFakeTimers();
      const now = new Date('2026-06-01T12:00:00Z');
      vi.setSystemTime(now);

      sesionService.iniciarSesion(1, 12, UsuarioRol.OPERARIO);
      // No warning callback set — must not throw at the warning window.
      vi.setSystemTime(new Date(now.getTime() + 35 * 1000));
      expect(() => sesionService.obtenerSesion(1)).not.toThrow();
    });

    it('does not expire before the configured timeout', () => {
      vi.useFakeTimers();
      const now = new Date('2026-06-01T12:00:00Z');
      vi.setSystemTime(now);

      sesionService.iniciarSesion(1, 13, UsuarioRol.OPERARIO);

      vi.setSystemTime(new Date(now.getTime() + 50 * 1000)); // < 60s
      const retrieved = sesionService.obtenerSesion(1);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.usuarioId).toBe(13);
    });

    it('resets warningSent to false when actividad is refreshed', () => {
      vi.useFakeTimers();
      const now = new Date('2026-06-01T12:00:00Z');
      vi.setSystemTime(now);

      sesionService.iniciarSesion(1, 14, UsuarioRol.OPERARIO);
      const warningCb = vi.fn();
      sesionService.setInactivityWarningCallback(warningCb);

      // First warning window
      vi.setSystemTime(new Date(now.getTime() + 35 * 1000));
      sesionService.obtenerSesion(1);
      expect(warningCb).toHaveBeenCalledTimes(1);

      // Activity resets the window AND the warningSent flag
      vi.setSystemTime(new Date(now.getTime() + 40 * 1000));
      sesionService.actualizarActividad(1);

      // New warning window — warning must fire again
      vi.setSystemTime(new Date(now.getTime() + 40 * 1000 + 35 * 1000));
      const retrieved = sesionService.obtenerSesion(1);
      expect(retrieved).not.toBeNull();
      expect(warningCb).toHaveBeenCalledTimes(2);
    });
  });
});

