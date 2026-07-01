import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    it('clears session details after 5+ min for operario', () => {
      vi.useFakeTimers();
      const now = new Date('2026-06-01T12:00:00Z');
      vi.setSystemTime(now);

      sesionService.iniciarSesion(1, 10, UsuarioRol.OPERARIO);
      
      vi.setSystemTime(new Date(now.getTime() + 6 * 60 * 1000));
      
      const retrieved = sesionService.obtenerSesion(1);
      expect(retrieved!.usuarioId).toBeNull();
      expect(retrieved!.usuarioRol).toBeNull();
      expect(retrieved!.ultimaActividadAt).toBeNull();

      vi.useRealTimers();
    });

    it('clears session details after 5+ min for jefe', () => {
      vi.useFakeTimers();
      const now = new Date('2026-06-01T12:00:00Z');
      vi.setSystemTime(now);

      sesionService.iniciarSesion(1, 20, UsuarioRol.JEFE);
      
      vi.setSystemTime(new Date(now.getTime() + 6 * 60 * 1000));
      
      const retrieved = sesionService.obtenerSesion(1);
      expect(retrieved!.usuarioId).toBeNull();
      expect(retrieved!.usuarioRol).toBeNull();
      expect(retrieved!.ultimaActividadAt).toBeNull();

      vi.useRealTimers();
    });

    it('clears session details after 5+ min for administrador', () => {
      vi.useFakeTimers();
      const now = new Date('2026-06-01T12:00:00Z');
      vi.setSystemTime(now);

      sesionService.iniciarSesion(1, 30, UsuarioRol.ADMINISTRADOR);
      
      vi.setSystemTime(new Date(now.getTime() + 6 * 60 * 1000));
      
      const retrieved = sesionService.obtenerSesion(1);
      expect(retrieved!.usuarioId).toBeNull();
      expect(retrieved!.usuarioRol).toBeNull();
      expect(retrieved!.ultimaActividadAt).toBeNull();

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
});

