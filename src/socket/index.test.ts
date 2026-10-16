import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { MikroORM } from '@mikro-orm/postgresql';
import type { SesionService } from '../services/sesion.service.js';
import { onSocketConnection, getIo, initSocket } from './index.js';
import { registerBalanzaHandlers } from './balanza.handler.js';
import { handleDeviceConnection } from './device-pairing.handler.js';
import { registerWeightIssueReportHandler } from './weight-issue-report.handler.js';
import type { WeightIssueReporter } from '../services/weight-issue-report.service.js';

vi.mock('./balanza.handler.js', () => ({
  registerBalanzaHandlers: vi.fn(),
}));

vi.mock('./device-pairing.handler.js', () => ({
  handleDeviceConnection: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./weight-issue-report.handler.js', () => ({
  registerWeightIssueReportHandler: vi.fn(),
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

  it('registers the weight issue report handler when a reporter is provided', () => {
    const socket = makeMockSocket({ user: { rol: 'operario' } });
    const reporter = { submit: vi.fn() } as unknown as WeightIssueReporter;
    onSocketConnection(io, socket as Socket, orm, sesionSvc, reporter);
    expect(registerWeightIssueReportHandler).toHaveBeenCalledWith(socket, reporter);
  });

  it('does not register the weight issue report handler without a reporter', () => {
    onSocketConnection(io, makeMockSocket({ user: { rol: 'operario' } }) as Socket, orm, sesionSvc);
    expect(registerWeightIssueReportHandler).not.toHaveBeenCalled();
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

describe('initSocket reporter wiring', () => {
  it('builds the reporter once and registers the report handler on every connection', () => {
    vi.mocked(registerWeightIssueReportHandler).mockClear();
    const io = initSocket(http.createServer(), {} as MikroORM, {
      setInactivityWarningCallback: vi.fn(),
      setInactivityCloseCallback: vi.fn(),
      verificarInactividad: vi.fn(),
    } as unknown as SesionService);

    const [onConnection] = io.sockets.listeners('connection') as Array<(socket: Socket) => void>;
    onConnection(makeMockSocket({ user: { rol: 'operario' } }) as Socket);
    onConnection(makeMockSocket({ user: { rol: 'operario' } }) as Socket);

    const calls = vi.mocked(registerWeightIssueReportHandler).mock.calls;
    expect(calls).toHaveLength(2);
    expect(typeof calls[0][1].submit).toBe('function');
    expect(calls[0][1]).toBe(calls[1][1]);
    clearInterval((io as unknown as { __inactivityTimer: NodeJS.Timeout }).__inactivityTimer);
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

describe('initSocket timers', () => {
  afterEach(() => vi.useRealTimers());

  it('only schedules the inactivity check (no balanza flow timer) and clears it on cleanup', () => {
    vi.useFakeTimers();
    const verificarInactividad = vi.fn();
    const io = initSocket(http.createServer(), {} as MikroORM, {
      setInactivityWarningCallback: vi.fn(),
      setInactivityCloseCallback: vi.fn(),
      verificarInactividad,
    } as unknown as SesionService);

    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(10_000);
    expect(verificarInactividad).toHaveBeenCalledTimes(1);

    (io as unknown as { __cleanupInactivityTimer: () => void }).__cleanupInactivityTimer();
    expect(vi.getTimerCount()).toBe(0);
    io.close();
  });
});
