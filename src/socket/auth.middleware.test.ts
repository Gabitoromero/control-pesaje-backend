import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { deviceAuthMiddleware, tabletJwtMiddleware } from './auth.middleware.js';

const DEVICE_SECRET = 'test-device-secret';

const makeSocket = (auth: Record<string, unknown> = {}): Partial<Socket> => ({
  handshake: { auth } as Socket['handshake'],
  data: {} as Socket['data'],
});

describe('deviceAuthMiddleware', () => {
  let next: Mock<(err?: Error) => void>;

  beforeEach(() => {
    next = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---- Device secret path ----

  it('allows connection and sets isDevice when hardwareId is a valid UUID', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';
    const socket = makeSocket({ hardwareId: validUuid });
    deviceAuthMiddleware(socket as Socket, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
    expect((socket.data as Record<string, unknown>).isDevice).toBe(true);
    expect((socket.data as Record<string, unknown>).hardwareId).toBe(validUuid);
  });

  it('rejects connection when hardwareId is an invalid UUID format', () => {
    const socket = makeSocket({ hardwareId: 'not-a-uuid' });
    deviceAuthMiddleware(socket as Socket, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  // ---- Tablet / unauthenticated path ----

  it('allows unauthenticated connection (tablet path)', () => {
    const socket = makeSocket({});
    deviceAuthMiddleware(socket as Socket, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
  });

  it('does not set isDevice when connection has no auth', () => {
    const socket = makeSocket({});
    deviceAuthMiddleware(socket as Socket, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
    expect((socket.data as Record<string, unknown>).isDevice).toBeFalsy();
  });

  it('does not set isDevice when hardwareId is an invalid string', () => {
    const socket = makeSocket({ hardwareId: 'invalid' });
    deviceAuthMiddleware(socket as Socket, next);
    expect((socket.data as Record<string, unknown>).isDevice).toBeFalsy();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});

// ---- tabletJwtMiddleware ----

const JWT_SECRET = 'test-jwt-secret';

const makeTabletPayload = () => ({
  id: 1,
  nombreUsuario: 'testuser',
  legajo: 'L001',
  rol: 'operario' as const,
  puedeTomarMuestrasLibres: false,
});

const makeSocketWithAuth = (auth: Record<string, unknown> = {}, data: Record<string, unknown> = {}): Partial<Socket> => ({
  handshake: { auth } as Socket['handshake'],
  data: { ...data } as Socket['data'],
});

describe('tabletJwtMiddleware', () => {
  let next: Mock<(err?: Error) => void>;

  beforeEach(() => {
    next = vi.fn();
    process.env.JWT_SECRET = JWT_SECRET;
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.JWT_SECRET;
  });

  it('skips JWT check and calls next() immediately when socket.data.isDevice is true', () => {
    const socket = makeSocketWithAuth({}, { isDevice: true });
    tabletJwtMiddleware(socket as Socket, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
    expect((socket.data as Record<string, unknown>).user).toBeUndefined();
  });

  it('rejects with unauthorized when no token is provided', () => {
    const socket = makeSocketWithAuth({});
    tabletJwtMiddleware(socket as Socket, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(next.mock.calls[0][0]?.message).toBe('unauthorized');
  });

  it('rejects with unauthorized when token is an invalid JWT', () => {
    const socket = makeSocketWithAuth({ token: 'not-a-valid-token' });
    tabletJwtMiddleware(socket as Socket, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(next.mock.calls[0][0]?.message).toBe('unauthorized');
  });

  it('rejects with unauthorized when token is expired', () => {
    const expiredToken = jwt.sign(makeTabletPayload(), JWT_SECRET, { expiresIn: -1 });
    const socket = makeSocketWithAuth({ token: expiredToken });
    tabletJwtMiddleware(socket as Socket, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(next.mock.calls[0][0]?.message).toBe('unauthorized');
  });

  it('attaches decoded payload to socket.data.user and calls next() when token is valid', () => {
    const payload = makeTabletPayload();
    const validToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    const socket = makeSocketWithAuth({ token: validToken });
    tabletJwtMiddleware(socket as Socket, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
    const user = (socket.data as Record<string, unknown>).user as Record<string, unknown>;
    expect(user).toBeDefined();
    expect(user.id).toBe(payload.id);
    expect(user.nombreUsuario).toBe(payload.nombreUsuario);
  });

  it('rejects with unauthorized when JWT_SECRET is unset (fail-closed)', () => {
    delete process.env.JWT_SECRET;
    const payload = makeTabletPayload();
    const tokenSignedWithSecret = jwt.sign(payload, JWT_SECRET);
    const socket = makeSocketWithAuth({ token: tokenSignedWithSecret });
    tabletJwtMiddleware(socket as Socket, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(next.mock.calls[0][0]?.message).toBe('unauthorized');
    expect((socket.data as Record<string, unknown>).user).toBeUndefined();
  });
});

// ---- middleware chain integration ----

describe('middleware chain (deviceAuthMiddleware → tabletJwtMiddleware)', () => {
  let next: Mock<(err?: Error) => void>;

  beforeEach(() => {
    next = vi.fn();
    process.env.JWT_SECRET = JWT_SECRET;
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.JWT_SECRET;
  });

  it('device socket: passes deviceAuthMiddleware then tabletJwtMiddleware short-circuits without touching user', () => {
    const socket = makeSocket({ hardwareId: '123e4567-e89b-12d3-a456-426614174000' });
    // Run device middleware first — sets isDevice = true
    deviceAuthMiddleware(socket as Socket, (err) => {
      if (err) throw err;
    });
    expect((socket.data as Record<string, unknown>).isDevice).toBe(true);

    // Run tablet middleware — must short-circuit
    tabletJwtMiddleware(socket as Socket, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
    expect((socket.data as Record<string, unknown>).user).toBeUndefined();
  });

  it('tablet without token: is rejected by tabletJwtMiddleware', () => {
    const socket = makeSocket({});
    // Device middleware passes through (no hardwareId)
    deviceAuthMiddleware(socket as Socket, (err) => {
      if (err) throw err;
    });
    expect((socket.data as Record<string, unknown>).isDevice).toBeFalsy();

    // Tablet middleware rejects — no token
    tabletJwtMiddleware(socket as Socket, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(next.mock.calls[0][0]?.message).toBe('unauthorized');
  });

  it('tablet with valid token: passes both middlewares with user attached', () => {
    const payload = makeTabletPayload();
    const validToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    const socket = makeSocket({ token: validToken });

    // Device middleware passes through
    deviceAuthMiddleware(socket as Socket, (err) => {
      if (err) throw err;
    });
    expect((socket.data as Record<string, unknown>).isDevice).toBeFalsy();

    // Tablet middleware attaches user
    tabletJwtMiddleware(socket as Socket, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
    const user = (socket.data as Record<string, unknown>).user as Record<string, unknown>;
    expect(user).toBeDefined();
    expect(user.id).toBe(payload.id);
    expect(user.nombreUsuario).toBe(payload.nombreUsuario);
  });
});
