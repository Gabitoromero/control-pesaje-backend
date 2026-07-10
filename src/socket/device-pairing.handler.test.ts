import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Server, Socket } from 'socket.io';
import type { MikroORM } from '@mikro-orm/postgresql';
import { handleDeviceConnection, disconnectDeviceByHardwareId } from './device-pairing.handler.js';
import { findLineaByHardwareId } from '../services/device-pairing.service.js';
import { deviceRegistryService } from '../services/device-registry.service.js';

vi.mock('../services/device-registry.service.js', () => ({
  deviceRegistryService: {
    registerDevice: vi.fn(),
    removeDevice: vi.fn(),
    hasDeviceForLinea: vi.fn(),
  },
}));

vi.mock('../services/device-pairing.service.js', () => ({
  findLineaByHardwareId: vi.fn(),
}));

const makeMockOrm = (): Partial<MikroORM> => {
  const em = { findOne: vi.fn() };
  return {
    em: { fork: vi.fn().mockReturnValue(em) } as unknown as MikroORM['em'],
  };
};

const makeMockSocket = (overrides: Partial<Socket> = {}): Partial<Socket> => ({
  id: 'socket-1',
  data: {} as Socket['data'],
  join: vi.fn(),
  ...overrides,
});

const makeMockIo = (): Partial<Server> => {
  const emitMock = vi.fn();
  const toMock = vi.fn().mockReturnValue({ emit: emitMock });
  return {
    to: toMock,
    _toEmit: emitMock,
  } as unknown as Partial<Server>;
};

describe('handleDeviceConnection', () => {
  let io: ReturnType<typeof makeMockIo>;
  let orm: ReturnType<typeof makeMockOrm>;

  beforeEach(() => {
    vi.clearAllMocks();
    io = makeMockIo();
    orm = makeMockOrm();
  });

  it('joins the paired línea room, sets lineaId, registers device, and emits balanza-status true when hardwareId resolves', async () => {
    const lineaFixture = { id: 5, activo: true };
    vi.mocked(findLineaByHardwareId).mockResolvedValue(lineaFixture as never);
    const socket = makeMockSocket({ data: { isDevice: true, hardwareId: 'uuid-1' } as Socket['data'] });

    await handleDeviceConnection(io as Server, socket as Socket, orm as unknown as MikroORM);

    expect(orm.em!.fork).toHaveBeenCalledOnce();
    expect(findLineaByHardwareId).toHaveBeenCalledWith(expect.anything(), 'uuid-1');
    expect(socket.join).toHaveBeenCalledWith('linea-5');
    expect((socket.data as Record<string, unknown>).lineaId).toBe(5);
    expect(deviceRegistryService.registerDevice).toHaveBeenCalledWith('socket-1', 5);
    expect(io.to).toHaveBeenCalledWith('linea-5');
    const emitMock = (io as unknown as { _toEmit: ReturnType<typeof vi.fn> })._toEmit;
    expect(emitMock).toHaveBeenCalledWith('balanza-status', { isConnected: true });
  });

  it('emits unknown-device-connected only to the admin room when hardwareId does not resolve', async () => {
    vi.mocked(findLineaByHardwareId).mockResolvedValue(null);
    const socket = makeMockSocket({ data: { isDevice: true, hardwareId: 'unknown-uuid' } as Socket['data'] });

    await handleDeviceConnection(io as Server, socket as Socket, orm as unknown as MikroORM);

    expect(socket.join).not.toHaveBeenCalled();
    expect(deviceRegistryService.registerDevice).not.toHaveBeenCalled();
    expect(io.to).toHaveBeenCalledExactlyOnceWith('admin');
    const emitMock = (io as unknown as { _toEmit: ReturnType<typeof vi.fn> })._toEmit;
    expect(emitMock).toHaveBeenCalledWith('unknown-device-connected', { hardwareId: 'unknown-uuid' });
  });

  it('does nothing when socket is not a device', async () => {
    const socket = makeMockSocket({ data: {} as Socket['data'] });

    await handleDeviceConnection(io as Server, socket as Socket, orm as unknown as MikroORM);

    expect(orm.em!.fork).not.toHaveBeenCalled();
    expect(findLineaByHardwareId).not.toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
  });

  it('does nothing when isDevice is true but hardwareId is missing', async () => {
    const socket = makeMockSocket({ data: { isDevice: true } as Socket['data'] });

    await handleDeviceConnection(io as Server, socket as Socket, orm as unknown as MikroORM);

    expect(orm.em!.fork).not.toHaveBeenCalled();
    expect(findLineaByHardwareId).not.toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
  });
});

describe('disconnectDeviceByHardwareId', () => {
  const makeIoWithSockets = (sockets: Array<Partial<Socket>>): Partial<Server> => {
    const socketsMap = new Map(sockets.map((s, i) => [s.id ?? `socket-${i}`, s]));
    return {
      sockets: { sockets: socketsMap } as unknown as Server['sockets'],
    } as Partial<Server>;
  };

  it('finds and disconnects the matching device socket', () => {
    const disconnect = vi.fn();
    const deviceSocket: Partial<Socket> = {
      id: 'socket-1',
      data: { isDevice: true, hardwareId: 'uuid-1' } as Socket['data'],
      disconnect,
    };
    const io = makeIoWithSockets([deviceSocket]);

    disconnectDeviceByHardwareId(io as Server, 'uuid-1');

    expect(disconnect).toHaveBeenCalledWith(true);
  });

  it('does not disconnect a non-device socket even if some field happens to match', () => {
    const disconnect = vi.fn();
    const tabletSocket: Partial<Socket> = {
      id: 'socket-1',
      data: { isDevice: false, hardwareId: 'uuid-1' } as Socket['data'],
      disconnect,
    };
    const io = makeIoWithSockets([tabletSocket]);

    disconnectDeviceByHardwareId(io as Server, 'uuid-1');

    expect(disconnect).not.toHaveBeenCalled();
  });

  it('does not disconnect a device socket with a different hardwareId', () => {
    const disconnect = vi.fn();
    const deviceSocket: Partial<Socket> = {
      id: 'socket-1',
      data: { isDevice: true, hardwareId: 'uuid-other' } as Socket['data'],
      disconnect,
    };
    const io = makeIoWithSockets([deviceSocket]);

    disconnectDeviceByHardwareId(io as Server, 'uuid-1');

    expect(disconnect).not.toHaveBeenCalled();
  });

  it('does nothing (no throw) when no matching socket is connected at all', () => {
    const io = makeIoWithSockets([]);

    expect(() => disconnectDeviceByHardwareId(io as Server, 'uuid-1')).not.toThrow();
  });
});
