import type { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import type { JWTPayload } from '../middlewares/auth.middleware.js';

// Augment Socket.IO SocketData so socket.data fields are typed everywhere
declare module 'socket.io' {
  interface SocketData {
    isDevice?: boolean;
    user?: JWTPayload;
    lineaId?: number;
  }
}

/**
 * Socket.IO handshake middleware — device authentication gate.
 *
 * Devices (Raspberry Pi): validate socket.handshake.auth.deviceSecret
 *   against DEVICE_SECRET env var. Sets socket.data.isDevice = true on success.
 *   Fails closed if DEVICE_SECRET is unset.
 *
 * All other connections (tablets) pass through unauthenticated.
 * JWT validation does NOT occur at the socket layer.
 */
export const deviceAuthMiddleware = (
  socket: Socket,
  next: (err?: Error) => void,
): void => {
  const auth = socket.handshake.auth as Record<string, unknown> | undefined;

  const expectedSecret = process.env.DEVICE_SECRET;
  const providedSecret = auth?.deviceSecret;

  if (typeof providedSecret === 'string') {
    // Device secret was supplied — evaluate it (fail-closed if env var unset)
    if (expectedSecret && providedSecret === expectedSecret) {
      socket.data.isDevice = true;
      return next();
    }
    // Wrong secret or DEVICE_SECRET not configured → reject immediately
    return next(new Error('unauthorized'));
  }

  // No deviceSecret provided — tablet path, pass through unauthenticated
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
