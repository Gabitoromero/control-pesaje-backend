import http from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { MikroORM } from '@mikro-orm/postgresql';
import type { SesionService } from '../services/sesion.service.js';
import { deviceAuthMiddleware, tabletJwtMiddleware } from './auth.middleware.js';
import { registerBalanzaHandlers } from './balanza.handler.js';
import { handleDeviceConnection } from './device-pairing.handler.js';
import { sesionService } from '../services/sesion.service.js';
import { UsuarioRol } from '../models/Usuario.js';

let ioInstance: Server | null = null;

export const getIo = (): Server => {
  if (!ioInstance) {
    throw new Error('Socket.io not initialized');
  }
  return ioInstance;
};

/**
 * Per-connection bootstrap: admin room auto-join (role-gated, no client
 * emit required — the JWT role is already decoded onto socket.data.user by
 * tabletJwtMiddleware before `connection` fires), device pairing (connects
 * a device socket to its línea room based on hardwareId), and the balanza
 * domain handlers.
 *
 * Extracted as a standalone export so it can be unit tested without
 * spinning up a real Socket.IO server/client pair.
 */
export const onSocketConnection = (
  io: Server,
  socket: Socket,
  orm: MikroORM,
  sesionSvc: SesionService = sesionService,
): void => {
  const rol = socket.data.user?.rol;
  if (rol === UsuarioRol.ADMINISTRADOR || rol === UsuarioRol.JEFE) {
    socket.join('admin');
  }

  void handleDeviceConnection(io, socket, orm).catch((err) => {
    console.error('[socket] device pairing failed', err);
  });

  registerBalanzaHandlers(io, socket, orm, sesionSvc);
};

/**
 * Initializes the Socket.IO server bound to the given HTTP server.
 * Must be called after http.createServer(app) and before httpServer.listen().
 */
/**
 * Initializes the Socket.IO server bound to the given HTTP server.
 * Must be called after http.createServer(app) and before httpServer.listen().
 *
 * `sesionSvc` is injected (defaulting to the singleton) so the inactivity
 * callback wiring is testable without depending on the global instance.
 */
export const initSocket = (
  httpServer: http.Server,
  orm: MikroORM,
  sesionSvc: SesionService = sesionService,
): Server => {
  ioInstance = new Server(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket', 'polling'],
  });

  const io = ioInstance;

  io.use(deviceAuthMiddleware);
  io.use(tabletJwtMiddleware);

  // Wire inactivity lifecycle to socket room emissions. The SesionService
  // detects expiry lazily and invokes these callbacks; the socket layer turns
  // them into targeted room events so only the affected línea is notified.
  sesionSvc.setInactivityWarningCallback((lineaProduccionId: number) => {
    io.to(`linea-${lineaProduccionId}`).emit('sesion-expirando', { lineaProduccionId });
  });
  sesionSvc.setInactivityCloseCallback((lineaProduccionId: number) => {
    io.to(`linea-${lineaProduccionId}`).emit('sesion-cerrada', {
      lineaProduccionId,
      reason: 'inactivity',
    });
  });

  io.on('connection', (socket) => {
    onSocketConnection(io, socket, orm);
  });

  return io;
};
