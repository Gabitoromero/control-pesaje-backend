import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { MikroORM } from '@mikro-orm/postgresql';
import type { SesionService } from '../services/sesion.service.js';
import { onSocketConnection, getIo, initSocket, createFlowContextResolver } from './index.js';
import { balanzaFlowMonitor } from '../services/balanza-flow-monitor.service.js';
import { registerBalanzaHandlers } from './balanza.handler.js';
import { handleDeviceConnection } from './device-pairing.handler.js';

vi.mock('./balanza.handler.js', () => ({
  registerBalanzaHandlers: vi.fn(),
}));

vi.mock('./device-pairing.handler.js', () => ({
  handleDeviceConnection: vi.fn().mockResolvedValue(undefined),
}));

const makeMockSocket = (data: Record<string, unknown> = {}): Partial<Socket> => ({
  data: { ...data } as Socket['data'],
  join: vi.fn(),
});

describe('onSocketConnection', () => {
  const io = {} as Server;
  const orm = {} as MikroORM;
  const sesionSvc = {} as SesionService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('joins the admin room when user.rol is ADMINISTRADOR', () => {
    const socket = makeMockSocket({ user: { rol: 'administrador' } });
    onSocketConnection(io, socket as Socket, orm, sesionSvc);
    expect(socket.join).toHaveBeenCalledWith('admin');
  });

  it('joins the admin room when user.rol is JEFE', () => {
    const socket = makeMockSocket({ user: { rol: 'jefe' } });
    onSocketConnection(io, socket as Socket, orm, sesionSvc);
    expect(socket.join).toHaveBeenCalledWith('admin');
  });

  it('does not join the admin room for other roles', () => {
    const socket = makeMockSocket({ user: { rol: 'operario' } });
    onSocketConnection(io, socket as Socket, orm, sesionSvc);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('does not join the admin room for a device socket (isDevice, no user)', () => {
    const socket = makeMockSocket({ isDevice: true, hardwareId: 'uuid-1' });
    onSocketConnection(io, socket as Socket, orm, sesionSvc);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('invokes handleDeviceConnection and registerBalanzaHandlers for every connection', () => {
    const socket = makeMockSocket({ user: { rol: 'operario' } });
    onSocketConnection(io, socket as Socket, orm, sesionSvc);
    expect(handleDeviceConnection).toHaveBeenCalledWith(io, socket, orm);
    expect(registerBalanzaHandlers).toHaveBeenCalledWith(io, socket, orm, sesionSvc);
  });
});

describe('getIo and initSocket', () => {
  it('getIo throws an error if initSocket has not been called', () => {
    // Para asegurar que no está inicializado (estado limpio por módulos)
    // En Vitest los tests corren en workers con módulos cacheados, 
    // pero si ya se inicializó en otro test de este archivo fallará.
    // getIo() lanza Error('Socket.io not initialized') si ioInstance es null.
    // Sin embargo, si initSocket() se llama antes, esto fallaría. 
    // Por eso probamos que tire error asumiendo el estado inicial nulo.
    expect(() => getIo()).toThrow('Socket.io not initialized');
  });

  it('initSocket creates and returns a Server instance, making getIo available', () => {
    const httpServer = http.createServer();
    const orm = {} as MikroORM;
    const io = initSocket(httpServer, orm);

    expect(io).toBeInstanceOf(Server);
    expect(getIo()).toBe(io);

    // Cleanup
    io.close();
  });
});

describe('initSocket CORS configuration', () => {
  const originalAllowedOrigin = process.env.ALLOWED_ORIGIN;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.ALLOWED_ORIGIN = originalAllowedOrigin;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('accepts the configured ALLOWED_ORIGIN and rejects any other origin', () => {
    process.env.ALLOWED_ORIGIN = 'http://trusted.example.com';
    const httpServer = http.createServer();
    const orm = {} as MikroORM;

    const io = initSocket(httpServer, orm);
    // `opts` is private on socket.io's Server type — cast through unknown
    // purely for this test's introspection, no production code depends on it.
    const ioOpts = (io as unknown as { opts: { cors?: { origin?: unknown } } }).opts;
    const originFn = ioOpts.cors?.origin as (
      origin: string,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => void;

    const trustedCb = vi.fn();
    originFn('http://trusted.example.com', trustedCb);
    expect(trustedCb).toHaveBeenCalledWith(null, true);

    const untrustedCb = vi.fn();
    originFn('http://evil.example.com', untrustedCb);
    expect(untrustedCb).toHaveBeenCalledWith(null, false);

    io.close();
  });
});

describe('initSocket wires inactivity callbacks to socket emissions', () => {
  it('registers inactivity warning + close callbacks and they emit to the line room', () => {
    const httpServer = http.createServer();
    const orm = {} as MikroORM;

    const warnSetter = vi.fn();
    const closeSetter = vi.fn();
    const mockSesionSvc = {
      setInactivityWarningCallback: warnSetter,
      setInactivityCloseCallback: closeSetter,
    } as unknown as SesionService;

    const io = initSocket(httpServer, orm, mockSesionSvc);

    expect(warnSetter).toHaveBeenCalledOnce();
    expect(closeSetter).toHaveBeenCalledOnce();

    const warnCb = warnSetter.mock.calls[0][0];
    const closeCb = closeSetter.mock.calls[0][0];

    const emitMock = vi.fn();
    const toMock = vi.fn().mockReturnValue({ emit: emitMock });
    const ioEmitMock = vi.fn();
    // Replace the instance method so .to(...) returns our mock chain.
    (io as unknown as { to: unknown; emit: unknown }).to = toMock;
    (io as unknown as { to: unknown; emit: unknown }).emit = ioEmitMock;

    warnCb(5);
    expect(toMock).toHaveBeenCalledWith('linea-5');
    expect(emitMock).toHaveBeenCalledWith('sesion-expirando', { lineaProduccionId: 5 });

    emitMock.mockClear();
    toMock.mockClear();
    ioEmitMock.mockClear();

    closeCb(7);
    expect(toMock).toHaveBeenCalledWith('linea-7');
    expect(emitMock).toHaveBeenCalledWith('sesion-cerrada', {
      lineaProduccionId: 7,
      reason: 'inactivity',
    });
    expect(ioEmitMock).toHaveBeenCalledWith('estado-lineas-actualizado');

    io.close();
  });
});

describe('createFlowContextResolver', () => {
  const makeIo = (room: string[], devices: Record<string, boolean>) =>
    ({
      sockets: {
        adapter: { rooms: new Map([['linea-5', new Set(room)]]) },
        sockets: new Map(Object.entries(devices).map(([id, isDevice]) => [id, { data: { isDevice } }])),
      },
    }) as unknown as Server;

  it('counts only non-device sockets in the room and resolves names from the DB', async () => {
    const io = makeIo(['a', 'b', 'c'], { a: true, b: false, c: false });
    const orm = {
      em: {
        fork: () => ({
          findOne: vi.fn().mockResolvedValue({ nombre: 'Linea 5', dispositivo: { nombre: 'RB-05', hardwareId: 'hw-5' } }),
        }),
      },
    } as unknown as MikroORM;
    const ctx = await createFlowContextResolver(io, orm)(5);
    expect(ctx).toMatchObject({ tabletSockets: 2, lineaNombre: 'Linea 5', rbNombre: 'RB-05', rbHardwareId: 'hw-5' });
    expect(ctx.rbConnected).toBe(false);
  });

  it('keeps registry/room data when the DB lookup fails', async () => {
    const io = makeIo(['b'], { b: false });
    const orm = {
      em: { fork: () => ({ findOne: vi.fn().mockRejectedValue(new Error('db down')) }) },
    } as unknown as MikroORM;
    const ctx = await createFlowContextResolver(io, orm)(5);
    expect(ctx.tabletSockets).toBe(1);
    expect(ctx.lineaNombre).toBeUndefined();
  });
});

describe('initSocket flow monitor wiring', () => {
  afterEach(() => vi.useRealTimers());

  it('runs the monitor check periodically and clears the timer on cleanup', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(balanzaFlowMonitor, 'check').mockResolvedValue(undefined);
    const io = initSocket(http.createServer(), {} as MikroORM, {
      setInactivityWarningCallback: vi.fn(),
      setInactivityCloseCallback: vi.fn(),
      verificarInactividad: vi.fn(),
    } as unknown as SesionService);

    vi.advanceTimersByTime(30_000);
    expect(spy).toHaveBeenCalledTimes(1);

    (io as unknown as { __cleanupInactivityTimer: () => void }).__cleanupInactivityTimer();
    vi.advanceTimersByTime(60_000);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    io.close();
  });
});
