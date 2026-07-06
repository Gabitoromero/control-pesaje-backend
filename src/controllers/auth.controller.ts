import type { RequestHandler } from 'express';
import { AuthService } from '../services/auth.service.js';
import { sesionService } from '../services/sesion.service.js';
import { getIo } from '../socket/index.js';
import { LoginSchema, SesionLineaSchema, ActividadSchema, CerrarSesionSchema } from '../utils/schemas.js';

const authService = new AuthService();

export const login: RequestHandler = async (req, res) => {
  try {
    const { legajo, pin } = LoginSchema.parse(req.body);
    if (sesionService.estaBloqueada(legajo)) {
      res.status(429).json({
        success: false,
        error: { message: 'Demasiados intentos fallidos. Bloqueado por 5 minutos.' }
      });
      return;
    }

    const token = await authService.login(legajo, pin);

    if (!token) {
      sesionService.registrarIntentoFallido(legajo);
      res.status(401).json({ success: false, error: { message: 'Credenciales inválidas o usuario inactivo' } });
      return;
    }

    sesionService.resetearIntentos(legajo);
    res.json({ success: true, data: { token } });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
  }
};

export const sesionLinea: RequestHandler = async (req, res) => {
  try {
    const { lineaProduccionId } = SesionLineaSchema.parse(req.body);
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
    res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
  }
};

export const actividad: RequestHandler = async (req, res) => {
  try {
    const { lineaProduccionId } = ActividadSchema.parse(req.body);
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
    res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
  }
};

export const cerrarSesion: RequestHandler = async (req, res) => {
  try {
    const { lineaProduccionId } = CerrarSesionSchema.parse(req.body);
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
      console.log(`[AUTH] Session deleted from memory for line ${lineaProduccionId}. Emitting sesion-cerrada...`);
      try {
        const io = getIo();
        io.to(`linea-${lineaProduccionId}`).emit('sesion-cerrada', { lineaProduccionId });
      } catch (error) {
        console.error('[AUTH] Failed to emit sesion-cerrada socket event', error);
      }
    }
    
    res.status(200).json({
      success: true,
      data: { message: 'Session closed successfully' }
    });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
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
    res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
  }
};

export const todasSesionesActivas: RequestHandler = async (req, res) => {
  try {
    const enrichedSessions = await sesionService.enriquecerSesiones();
    res.status(200).json({ success: true, data: enrichedSessions });
  } catch (error) {
    console.error('Error fetching sesiones activas:', error);
    res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
  }
};
