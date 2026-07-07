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
 * Devices (Raspberry Pi): validate socket.handshake.auth.hardwareId
 *   against a UUID format. Sets socket.data.isDevice = true and 
 *   socket.data.hardwareId on success.
 *
 * All other connections (tablets) pass through unauthenticated.
 * JWT validation does NOT occur at the socket layer.
 */
export const deviceAuthMiddleware = (
  socket: Socket,
  next: (err?: Error) => void,
): void => {
  const auth = socket.handshake.auth as Record<string, unknown> | undefined;

  const providedHardwareId = auth?.hardwareId;

  if (typeof providedHardwareId === 'string') {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(providedHardwareId)) {
      socket.data.isDevice = true;
      socket.data.hardwareId = providedHardwareId;
      return next();
    }
    // Invalid UUID format
    return next(new Error('unauthorized'));
  }

  // No hardwareId provided — tablet path, pass through unauthenticated
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
