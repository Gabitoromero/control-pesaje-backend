import type { Socket } from 'socket.io';

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
