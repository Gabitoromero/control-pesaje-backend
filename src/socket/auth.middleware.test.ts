import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import type { Socket } from 'socket.io';
import { deviceAuthMiddleware } from './auth.middleware.js';

const DEVICE_SECRET = 'test-device-secret';

const makeSocket = (auth: Record<string, unknown> = {}): Partial<Socket> => ({
  handshake: { auth } as Socket['handshake'],
  data: {} as Socket['data'],
});

describe('deviceAuthMiddleware', () => {
  let next: Mock<(err?: Error) => void>;

  beforeEach(() => {
    next = vi.fn();
    process.env.DEVICE_SECRET = DEVICE_SECRET;
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.DEVICE_SECRET;
  });

  // ---- Device secret path ----

  it('allows connection when deviceSecret matches DEVICE_SECRET', () => {
    const socket = makeSocket({ deviceSecret: DEVICE_SECRET });
    deviceAuthMiddleware(socket as Socket, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
    expect((socket.data as Record<string, unknown>).isDevice).toBe(true);
  });

  it('rejects connection when deviceSecret is wrong', () => {
    const socket = makeSocket({ deviceSecret: 'wrong-secret' });
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

  it('does not set isDevice when deviceSecret is wrong', () => {
    const socket = makeSocket({ deviceSecret: 'wrong-secret' });
    deviceAuthMiddleware(socket as Socket, next);
    expect((socket.data as Record<string, unknown>).isDevice).toBeFalsy();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  // ---- DEVICE_SECRET unset ----

  it('rejects connection via deviceSecret when DEVICE_SECRET is unset (fail-closed)', () => {
    delete process.env.DEVICE_SECRET;
    const socket = makeSocket({ deviceSecret: 'any-value' });
    deviceAuthMiddleware(socket as Socket, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
