import { describe, it, expect, beforeEach } from 'vitest';
import { sesionService } from './sesion.service.js';

describe('SesionService (In-Memory Session Registry)', () => {
  beforeEach(() => {
    sesionService.limpiar();
  });

  it('should successfully open an active tablet session', () => {
    const session = sesionService.iniciarSesion(1, 10, 5); // line 1, user 10, article 5
    expect(session.lineaProduccionId).toBe(1);
    expect(session.usuarioId).toBe(10);
    expect(session.articuloId).toBe(5);
    expect(session.pasadaId).toBeNull();
    expect(session.connectedAt).toBeInstanceOf(Date);

    const retrieved = sesionService.obtenerSesion(1);
    expect(retrieved).toEqual(session);
  });

  it('should enforce the single active session per operator constraint across all lines', () => {
    // operator 10 starts session on Line 1
    sesionService.iniciarSesion(1, 10, 5);
    expect(sesionService.obtenerSesion(1)).toBeDefined();

    // operator 10 starts session on Line 2
    sesionService.iniciarSesion(2, 10, 5);

    // Session on Line 1 must be terminated, session on Line 2 must be established
    expect(sesionService.obtenerSesion(1)).toBeUndefined();
    expect(sesionService.obtenerSesion(2)).toBeDefined();
    expect(sesionService.obtenerSesion(2)!.usuarioId).toBe(10);
  });

  it('should close a session successfully', () => {
    sesionService.iniciarSesion(1, 10, 5);
    const closed = sesionService.cerrarSesion(1);
    expect(closed).toBe(true);
    expect(sesionService.obtenerSesion(1)).toBeUndefined();

    const notClosed = sesionService.cerrarSesion(1);
    expect(notClosed).toBe(false);
  });

  it('should retrieve a session by user ID', () => {
    sesionService.iniciarSesion(1, 10, 5);
    const session = sesionService.obtenerSesionPorUsuario(10);
    expect(session).toBeDefined();
    expect(session!.lineaProduccionId).toBe(1);

    expect(sesionService.obtenerSesionPorUsuario(99)).toBeUndefined();
  });

  it('should update pasada ID for a session', () => {
    sesionService.iniciarSesion(1, 10, 5);
    sesionService.actualizarPasada(1, 42);

    const session = sesionService.obtenerSesion(1);
    expect(session!.pasadaId).toBe(42);
  });
});
