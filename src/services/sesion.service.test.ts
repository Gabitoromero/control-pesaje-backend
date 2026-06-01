import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sesionService } from './sesion.service.js';

describe('SesionService (In-Memory Session Registry)', () => {
  beforeEach(() => {
    sesionService.limpiar();
  });

  it('should successfully open an active tablet session', () => {
    const result = sesionService.iniciarSesion(1, 10, 20); // line 1, global user 10, operario 20
    expect(result.ok).toBe(true);
    const { session } = result as Extract<typeof result, { ok: true }>;
    expect(session.lineaProduccionId).toBe(1);
    expect(session.usuarioIdGlobal).toBe(10);
    expect(session.usuarioIdOperario).toBe(20);
    expect(session.pasadaId).toBeNull();
    expect(session.connectedAt).toBeInstanceOf(Date);

    const retrieved = sesionService.obtenerSesion(1);
    expect(retrieved).toEqual(session);
  });

  it('should return conflict when operator already has an active session on another line', () => {
    const r1 = sesionService.iniciarSesion(1, 10, 20);
    expect(r1.ok).toBe(true);
    expect(sesionService.obtenerSesion(1)).toBeDefined();

    const r2 = sesionService.iniciarSesion(2, 10, 20);
    expect(r2.ok).toBe(false);
    expect((r2 as Extract<typeof r2, { ok: false }>).conflict.lineaProduccionId).toBe(1);

    // Original session on line 1 must remain intact
    expect(sesionService.obtenerSesion(1)).toBeDefined();
    expect(sesionService.obtenerSesion(2)).toBeUndefined();
  });

  it('should allow new session after explicitly closing the previous one', () => {
    sesionService.iniciarSesion(1, 10, 20);
    sesionService.cerrarSesion(1);

    const result = sesionService.iniciarSesion(2, 10, 20);
    expect(result.ok).toBe(true);
    expect(sesionService.obtenerSesion(1)).toBeUndefined();
    expect(sesionService.obtenerSesion(2)).toBeDefined();
  });

  it('should close a session successfully', () => {
    sesionService.iniciarSesion(1, 10, 20);
    const closed = sesionService.cerrarSesion(1);
    expect(closed).toBe(true);
    expect(sesionService.obtenerSesion(1)).toBeUndefined();

    const notClosed = sesionService.cerrarSesion(1);
    expect(notClosed).toBe(false);
  });

  it('should retrieve a session by user ID', () => {
    sesionService.iniciarSesion(1, 10, 20);
    const session = sesionService.obtenerSesionPorUsuario(20);
    expect(session).toBeDefined();
    expect(session!.lineaProduccionId).toBe(1);

    expect(sesionService.obtenerSesionPorUsuario(99)).toBeUndefined();
  });

  it('should update pasada ID for a session', () => {
    sesionService.iniciarSesion(1, 10, 20);
    sesionService.actualizarPasada(1, 42);

    const session = sesionService.obtenerSesion(1);
    expect(session!.pasadaId).toBe(42);
  });

  it('should invalidate usuarioIdOperario after 5 minutes of inactivity', () => {
    vi.useFakeTimers();
    const now = new Date('2026-06-01T12:00:00Z');
    vi.setSystemTime(now);

    const result = sesionService.iniciarSesion(1, 10, 20);
    const { session } = result as Extract<typeof result, { ok: true }>;
    expect(session.usuarioIdOperario).toBe(20);
    expect(session.operarioUltimaActividadAt).toEqual(now);

    // Advance 4 minutes (not expired)
    vi.setSystemTime(new Date(now.getTime() + 4 * 60 * 1000));
    let retrieved = sesionService.obtenerSesion(1);
    expect(retrieved!.usuarioIdOperario).toBe(20);

    // Advance to 6 minutes (expired)
    vi.setSystemTime(new Date(now.getTime() + 6 * 60 * 1000));
    retrieved = sesionService.obtenerSesion(1);
    expect(retrieved!.usuarioIdOperario).toBeNull();
    expect(retrieved!.operarioUltimaActividadAt).toBeNull();
    expect(retrieved!.usuarioIdGlobal).toBe(10); // global user is preserved

    vi.useRealTimers();
  });

  it('should reset inactivity timeout on session activity updates', () => {
    vi.useFakeTimers();
    const now = new Date('2026-06-01T12:00:00Z');
    vi.setSystemTime(now);

    sesionService.iniciarSesion(1, 10, 20);

    // Advance 4 minutes
    vi.setSystemTime(new Date(now.getTime() + 4 * 60 * 1000));
    sesionService.actualizarActividad(1);

    // Advance another 4 minutes (total 8 from start, but only 4 from last activity)
    vi.setSystemTime(new Date(now.getTime() + 8 * 60 * 1000));
    const retrieved = sesionService.obtenerSesion(1);
    expect(retrieved!.usuarioIdOperario).toBe(20); // should still be active

    vi.useRealTimers();
  });

  it('should block line PIN validation for 5 minutes after 3 consecutive failed attempts', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    expect(sesionService.estaBloqueada(1)).toBe(false);

    // 1st failed attempt
    sesionService.registrarIntentoFallido(1);
    expect(sesionService.estaBloqueada(1)).toBe(false);

    // 2nd failed attempt
    sesionService.registrarIntentoFallido(1);
    expect(sesionService.estaBloqueada(1)).toBe(false);

    // 3rd failed attempt -> lock triggered
    sesionService.registrarIntentoFallido(1);
    expect(sesionService.estaBloqueada(1)).toBe(true);

    // Advance 4 minutes (still blocked)
    vi.setSystemTime(now + 4 * 60 * 1000);
    expect(sesionService.estaBloqueada(1)).toBe(true);

    // Advance to 6 minutes (unblocked)
    vi.setSystemTime(now + 6 * 60 * 1000);
    expect(sesionService.estaBloqueada(1)).toBe(false);

    vi.useRealTimers();
  });

  it('should reset consecutive failed attempts upon successful session start', () => {
    sesionService.registrarIntentoFallido(1);
    sesionService.registrarIntentoFallido(1);

    sesionService.iniciarSesion(1, 10, 20);

    // One more failed attempt shouldn't block the line because attempts were reset
    sesionService.registrarIntentoFallido(1);
    expect(sesionService.estaBloqueada(1)).toBe(false);
  });
});
