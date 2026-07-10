import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Server, Socket } from 'socket.io';
import type { MikroORM } from '@mikro-orm/postgresql';
import type { SesionService } from '../services/sesion.service.js';
import { onSocketConnection } from './index.js';
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
