import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import http from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { MikroORM } from '@mikro-orm/postgresql';
import type { SesionService } from '../services/sesion.service.js';
import { onSocketConnection, getIo, initSocket } from './index.js';
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
    // Replace the instance method so .to(...) returns our mock chain.
    (io as unknown as { to: unknown }).to = toMock;

    warnCb(5);
    expect(toMock).toHaveBeenCalledWith('linea-5');
    expect(emitMock).toHaveBeenCalledWith('sesion-expirando', { lineaProduccionId: 5 });

    emitMock.mockClear();
    toMock.mockClear();

    closeCb(7);
    expect(toMock).toHaveBeenCalledWith('linea-7');
    expect(emitMock).toHaveBeenCalledWith('sesion-cerrada', {
      lineaProduccionId: 7,
      reason: 'inactivity',
    });

    io.close();
  });
});
