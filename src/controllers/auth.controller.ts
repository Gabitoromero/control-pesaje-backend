import type { RequestHandler } from 'express';
import { RequestContext, type FilterQuery } from '@mikro-orm/core';
import { AuthService } from '../services/auth.service.js';
import { Usuario, UsuarioRol } from '../models/Usuario.js';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { sesionService } from '../services/sesion.service.js';

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
  } catch (err) {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

export const activateOperatorSession: RequestHandler = async (req, res) => {
  const { pin, lineaProduccionId } = req.body as { pin: string; lineaProduccionId: number };

  try {
    const em = RequestContext.getEntityManager();
    if (!em) throw new Error('No EntityManager in RequestContext');

    // 1. Check if line is blocked
    if (sesionService.estaBloqueada(lineaProduccionId)) {
      res.status(429).json({
        success: false,
        error: { message: 'Too many consecutive failed attempts. Blocked for 5 minutes.' }
      });
      return;
    }

    // 2. Validate PIN against active operario in PostgreSQL
    const operario = await em.findOne(
      Usuario,
      {
        rol: UsuarioRol.OPERARIO,
        activo: true,
        datosAdicionales: { pin },
      } as FilterQuery<Usuario>
    );

    if (!operario) {
      sesionService.registrarIntentoFallido(lineaProduccionId);
      res.status(404).json({
        success: false,
        error: { message: 'No active user found with the provided PIN' }
      });
      return;
    }

    // 3. Verify production line exists
    const linea = await em.findOne(LineaProduccion, { id: lineaProduccionId });

    if (!linea) {
      res.status(404).json({
        success: false,
        error: { message: 'Production line not found' }
      });
      return;
    }

    const usuarioIdGlobal = req.user!.id;

    // 4. Establish session in memory
    const result = sesionService.iniciarSesion(lineaProduccionId, usuarioIdGlobal, operario.id);

    if (!result.ok) {
      res.status(409).json({
        success: false,
        error: {
          code: 'OPERATOR_SESSION_CONFLICT',
          message: 'Operator already has an active session on another line',
          data: { lineaProduccionId: result.conflict.lineaProduccionId }
        }
      });
      return;
    }

    const { session } = result;

    res.status(200).json({
      success: true,
      data: {
        lineaProduccionId: session.lineaProduccionId,
        usuarioIdGlobal: session.usuarioIdGlobal,
        usuarioIdOperario: session.usuarioIdOperario,
        pasadaId: session.pasadaId,
        connectedAt: session.connectedAt.toISOString(),
        operarioUltimaActividadAt: session.operarioUltimaActividadAt ? session.operarioUltimaActividadAt.toISOString() : null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

export const closeOperatorSession: RequestHandler = async (req, res) => {
  const { lineaProduccionId } = req.body as { lineaProduccionId: number };

  try {
    const session = sesionService.obtenerSesion(lineaProduccionId);
    if (!session) {
      res.status(400).json({
        success: false,
        error: { message: 'No active session found for this line' }
      });
      return;
    }

    sesionService.cerrarSesion(lineaProduccionId);

    res.status(200).json({
      success: true,
      data: {
        message: 'Operator session closed successfully'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

export const getSesionActiva: RequestHandler = async (req, res) => {
  const { lineaId: lineaIdStr } = req.params as { lineaId: string };
  const lineaId = parseInt(lineaIdStr, 10);

  try {
    if (isNaN(lineaId)) {
      res.status(400).json({ success: false, error: { message: 'Invalid line ID' } });
      return;
    }

    const session = sesionService.obtenerSesion(lineaId);
    if (!session) {
      res.status(200).json({
        success: true,
        data: null
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        lineaProduccionId: session.lineaProduccionId,
        usuarioIdGlobal: session.usuarioIdGlobal,
        usuarioIdOperario: session.usuarioIdOperario,
        pasadaId: session.pasadaId,
        connectedAt: session.connectedAt.toISOString(),
        operarioUltimaActividadAt: session.operarioUltimaActividadAt ? session.operarioUltimaActividadAt.toISOString() : null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

