import http from 'node:http';
import { Server } from 'socket.io';
import type { MikroORM } from '@mikro-orm/postgresql';
import { deviceAuthMiddleware, tabletJwtMiddleware } from './auth.middleware.js';
import { registerBalanzaHandlers } from './balanza.handler.js';
import { sesionService } from '../services/sesion.service.js';

let ioInstance: Server | null = null;

export const getIo = (): Server => {
  if (!ioInstance) {
    throw new Error('Socket.io not initialized');
  }
  return ioInstance;
};

/**
 * Initializes the Socket.IO server bound to the given HTTP server.
 * Must be called after http.createServer(app) and before httpServer.listen().
 */
export const initSocket = (httpServer: http.Server, orm: MikroORM): Server => {
  ioInstance = new Server(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket', 'polling'],
  });

  const io = ioInstance;

  io.use(deviceAuthMiddleware);
  io.use(tabletJwtMiddleware);

  io.on('connection', (socket) => {
    registerBalanzaHandlers(io, socket, orm, sesionService);
  });

  return io;
};
