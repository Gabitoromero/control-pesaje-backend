import type { RequestHandler } from 'express';
import { AuthService } from '../services/auth.service.js';
import { sesionService } from '../services/sesion.service.js';
import { UsuarioRol } from '../models/Usuario.js';

const authService = new AuthService();

export const login: RequestHandler = async (req, res) => {
  const { legajo, pin } = req.body as { legajo: string; pin: string };

  try {
    if (sesionService.estaBloqueada(legajo)) {
      res.status(429).json({
        success: false,
        error: { message: 'Too many consecutive failed attempts. Blocked for 5 minutes.' }
      });
      return;
    }

    const token = await authService.login(legajo, pin);

    if (!token) {
      sesionService.registrarIntentoFallido(legajo);
      res.status(401).json({ success: false, error: { message: 'Invalid credentials or inactive user' } });
      return;
    }

    sesionService.resetearIntentos(legajo);
    res.json({ success: true, data: { token } });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

export const sesionLinea: RequestHandler = async (req, res) => {
  const { lineaProduccionId } = req.body as { lineaProduccionId: number };

  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { message: 'Not authenticated' } });
      return;
    }

    const result = sesionService.iniciarSesion(lineaProduccionId, req.user.id, req.user.rol);

    if (!result.ok) {
      res.status(409).json({
        success: false,
        error: { code: 'SESSION_CONFLICT', message: 'User already has an active session on another line' },
        data: { lineaProduccionId: result.conflict.lineaProduccionId }
      });
      return;
    }

    res.status(201).json({
      success: true,
      data: {
        usuarioId: result.session.usuarioId,
        usuarioRol: result.session.usuarioRol,
        ultimaActividadAt: result.session.ultimaActividadAt?.toISOString() || null
      }
    });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

export const actividad: RequestHandler = async (req, res) => {
  const { lineaProduccionId } = req.body as { lineaProduccionId: number };

  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { message: 'Not authenticated' } });
      return;
    }

    const session = sesionService.obtenerSesion(lineaProduccionId);
    if (!session || session.usuarioId === null) {
      res.status(404).json({ success: false, error: { message: 'No active session found for this line' } });
      return;
    }

    sesionService.actualizarActividad(lineaProduccionId);
    res.status(200).json({
      success: true,
      data: { ultimaActividadAt: session.ultimaActividadAt?.toISOString() }
    });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

export const cerrarSesion: RequestHandler = async (req, res) => {
  const { lineaProduccionId } = req.body as { lineaProduccionId?: number };

  try {
    if (lineaProduccionId !== undefined) {
      const session = sesionService.obtenerSesion(lineaProduccionId);
      if (!session) {
        res.status(400).json({
          success: false,
          error: { message: 'No active session found for this line' }
        });
        return;
      }
      sesionService.cerrarSesion(lineaProduccionId);
    }
    
    res.status(200).json({
      success: true,
      data: { message: 'Session closed successfully' }
    });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

export const sesionActiva: RequestHandler = async (req, res) => {
  const { lineaId: lineaIdStr } = req.params as { lineaId: string };
  const lineaId = parseInt(lineaIdStr, 10);

  try {
    if (isNaN(lineaId)) {
      res.status(400).json({ success: false, error: { message: 'Invalid line ID' } });
      return;
    }

    const session = sesionService.obtenerSesion(lineaId);
    if (!session) {
      res.status(200).json({ success: true, data: null });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        usuarioId: session.usuarioId,
        usuarioRol: session.usuarioRol,
        ultimaActividadAt: session.ultimaActividadAt?.toISOString() || null,
      }
    });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

export const todasSesionesActivas: RequestHandler = async (req, res) => {
  try {
    const activeSessions = sesionService.obtenerTodasLasSesiones();
    const em = (req as any).em || await import('@mikro-orm/core').then(m => m.RequestContext.getEntityManager());
    if (!em) throw new Error('No EntityManager in RequestContext');

    const UsuarioEntity = await import('../models/Usuario.js').then(m => m.Usuario);
    const LineaProduccionEntity = await import('../models/LineaProduccion.js').then(m => m.LineaProduccion);

    const enrichedSessions = await Promise.all(
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
          expiraEn: session.ultimaActividadAt ? new Date(session.ultimaActividadAt.getTime() + 5 * 60 * 1000).toISOString() : null,
        };
      })
    );

    res.status(200).json({ success: true, data: enrichedSessions });
  } catch (error) {
    console.error('Error fetching sesiones activas:', error);
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};
