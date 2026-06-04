import type { RequestHandler } from 'express';
import { AuthService } from '../services/auth.service.js';
import { sesionService } from '../services/sesion.service.js';
import { UsuarioRol } from '../models/Usuario.js';

const authService = new AuthService();

export const login: RequestHandler = async (req, res) => {
  const { nombreUsuario, contrasena } = req.body as { nombreUsuario: string; contrasena: string };

  try {
    const token = await authService.login(nombreUsuario, contrasena);

    if (!token) {
      res.status(401).json({ success: false, error: { message: 'Invalid credentials or inactive user' } });
      return;
    }

    res.json({ success: true, data: { token } });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

export const verificarPin: RequestHandler = async (req, res) => {
  const { legajo, pin } = req.body as { legajo: string; pin: string };

  try {
    const usuario = await authService.validatePin(legajo, pin);

    if (!usuario) {
      res.status(404).json({
        success: false,
        error: { message: 'No active user found with the provided PIN' }
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        usuario: {
          id: usuario.id,
          nombreApellido: usuario.nombreApellido,
          rol: usuario.rol,
        }
      }
    });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

export const activarSesion: RequestHandler = async (req, res) => {
  const { legajo, pin, lineaProduccionId } = req.body as { legajo: string; pin: string; lineaProduccionId?: number };

  try {
    // Rate limiting only applies to line-based sessions
    if (lineaProduccionId !== undefined && sesionService.estaBloqueada(lineaProduccionId)) {
      res.status(429).json({
        success: false,
        error: { message: 'Too many consecutive failed attempts. Blocked for 5 minutes.' }
      });
      return;
    }

    const usuario = await authService.validatePin(legajo, pin);

    if (!usuario) {
      if (lineaProduccionId !== undefined) {
        sesionService.registrarIntentoFallido(lineaProduccionId);
      }
      res.status(404).json({
        success: false,
        error: { message: 'No active user found with the provided PIN' }
      });
      return;
    }

    if (!req.user) {
      res.status(401).json({ success: false, error: { message: 'Not authenticated' } });
      return;
    }

    if (usuario.rol === UsuarioRol.OPERARIO) {
      if (lineaProduccionId === undefined) {
        res.status(400).json({
          success: false,
          error: { message: 'lineaProduccionId is required for operator sessions' }
        });
        return;
      }

      const linea = await authService.findLineaById(lineaProduccionId);
      if (!linea) {
        res.status(404).json({
          success: false,
          error: { message: 'Production line not found' }
        });
        return;
      }

      const result = sesionService.iniciarSesion(lineaProduccionId, req.user.id, usuario.id, usuario.rol);

      if (!result.ok) {
        res.status(409).json({
          success: false,
          error: { code: 'OPERATOR_SESSION_CONFLICT', message: 'Operator already has an active session on another line' },
          data: { lineaProduccionId: result.conflict.lineaProduccionId }
        });
        return;
      }

      const { session } = result;
      res.status(200).json({
        success: true,
        data: {
          lineaProduccionId: session.lineaProduccionId,
          usuarioIdGlobal: session.usuarioIdGlobal,
          usuarioIdUsuario: session.usuarioIdUsuario,
          rolUsuario: session.rolUsuario,
          pasadaId: session.pasadaId,
          connectedAt: session.connectedAt.toISOString(),
          usuarioUltimaActividadAt: session.usuarioUltimaActividadAt
            ? session.usuarioUltimaActividadAt.toISOString()
            : null
        }
      });
    } else {
      // Jefe/Admin/Visualizacion: global session not tied to a specific line
      const result = sesionService.iniciarSesion(null, req.user.id, usuario.id, usuario.rol);
      const { session } = result as Extract<typeof result, { ok: true }>;

      res.status(200).json({
        success: true,
        data: {
          lineaProduccionId: null,
          usuarioIdGlobal: session.usuarioIdGlobal,
          usuarioIdUsuario: session.usuarioIdUsuario,
          rolUsuario: session.rolUsuario,
          pasadaId: null,
          connectedAt: session.connectedAt.toISOString(),
          usuarioUltimaActividadAt: null
        }
      });
    }
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
    } else {
      if (!req.user) {
        res.status(401).json({ success: false, error: { message: 'Not authenticated' } });
        return;
      }
      const session = sesionService.obtenerSesionGlobal(req.user.id);
      if (!session) {
        res.status(400).json({
          success: false,
          error: { message: 'No active session found for this user' }
        });
        return;
      }
      sesionService.cerrarSesionGlobal(req.user.id);
    }

    res.status(200).json({
      success: true,
      data: { message: 'Session closed successfully' }
    });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

export const getActiveSesion: RequestHandler = async (req, res) => {
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
        lineaProduccionId: session.lineaProduccionId,
        usuarioIdGlobal: session.usuarioIdGlobal,
        usuarioIdUsuario: session.usuarioIdUsuario,
        rolUsuario: session.rolUsuario,
        pasadaId: session.pasadaId,
        connectedAt: session.connectedAt.toISOString(),
        usuarioUltimaActividadAt: session.usuarioUltimaActividadAt
          ? session.usuarioUltimaActividadAt.toISOString()
          : null
      }
    });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};
