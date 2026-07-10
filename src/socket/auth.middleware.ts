import type { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import type { JWTPayload } from '../middlewares/auth.middleware.js';

// Augment Socket.IO SocketData so socket.data fields are typed everywhere
declare module 'socket.io' {
  interface SocketData {
    isDevice?: boolean;
    hardwareId?: string;
    user?: JWTPayload;
    lineaId?: number;
  }
}

/**
 * Socket.IO handshake middleware — device authentication gate.
 *
 * Devices (Raspberry Pi): identified solely by presence of a non-empty
 *   string `hardwareId` in socket.handshake.auth. Sets socket.data.isDevice = true
 *   and stores socket.data.hardwareId for later pairing lookup.
 *
 * All other connections (tablets) pass through unauthenticated to
 *   tabletJwtMiddleware. This middleware never rejects a connection.
 */
export const deviceAuthMiddleware = (
  socket: Socket,
  next: (err?: Error) => void,
): void => {
  const auth = socket.handshake.auth as Record<string, unknown> | undefined;
  const hardwareId = auth?.hardwareId;

  if (typeof hardwareId === 'string' && hardwareId.length > 0) {
    socket.data.isDevice = true;
    socket.data.hardwareId = hardwareId;
  }

  // No hardwareId (or tablet path) — pass through to tabletJwtMiddleware
  return next();
};

/**
 * Socket.IO handshake middleware — tablet JWT authentication gate.
 *
 * Devices: already identified by deviceAuthMiddleware (socket.data.isDevice = true),
 *   so we short-circuit and call next() immediately.
 *
 * Tablets: must supply a valid JWT in socket.handshake.auth.token.
 *   On success: attaches decoded payload to socket.data.user.
 *   On failure (missing token, invalid/expired, missing secret): rejects with 'unauthorized'.
 */
export const tabletJwtMiddleware = (
  socket: Socket,
  next: (err?: Error) => void,
): void => {
  // Device short-circuit: deviceAuthMiddleware already authenticated this socket
  if (socket.data.isDevice) {
    return next();
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('[socket] JWT_SECRET is not configured — rejecting all tablet connections');
    return next(new Error('unauthorized'));
  }

  const auth = socket.handshake.auth as Record<string, unknown> | undefined;
  const token = auth?.token;

  if (typeof token !== 'string' || !token) {
    console.error('[socket] JWT token is missing or not a string. Rejecting.');
    return next(new Error('unauthorized'));
  }

  try {
    const payload = jwt.verify(token, secret) as JWTPayload;
    socket.data.user = payload;
    return next();
  } catch (err) {
    console.error('[socket] JWT verify failed:', err);
    return next(new Error('unauthorized'));
  }
};
