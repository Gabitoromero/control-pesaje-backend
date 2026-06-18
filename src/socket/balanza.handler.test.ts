import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Server, Socket } from 'socket.io';
import type { MikroORM } from '@mikro-orm/postgresql';
import { registerBalanzaHandlers } from './balanza.handler.js';

// ---- Mock helpers ----

const makeMockEm = (findOneResult: unknown = null) => ({
  findOne: vi.fn().mockResolvedValue(findOneResult),
});

const makeMockOrm = (findOneResult: unknown = null) => ({
  em: {
    fork: vi.fn().mockReturnValue(makeMockEm(findOneResult)),
  },
});

const makeMockSocket = (overrides: Partial<Socket> = {}): Partial<Socket> => ({
  data: {} as Socket['data'],
  join: vi.fn(),
  leave: vi.fn(),
  emit: vi.fn(),
  on: vi.fn(),
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

// Capture registered handlers from socket.on calls
const getHandler = (socket: Partial<Socket>, event: string) => {
  const calls = (socket.on as ReturnType<typeof vi.fn>).mock.calls;
  const call = calls.find(([e]) => e === event);
  return call ? call[1] : undefined;
};

describe('registerBalanzaHandlers', () => {
  let io: ReturnType<typeof makeMockIo>;
  let socket: ReturnType<typeof makeMockSocket>;
  let orm: ReturnType<typeof makeMockOrm>;

  beforeEach(() => {
    io = makeMockIo();
    socket = makeMockSocket();
    orm = makeMockOrm();
    vi.clearAllMocks();
  });

  describe('join-linea', () => {
    it('registers join-linea handler on socket', () => {
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM);
      const handler = getHandler(socket, 'join-linea');
      expect(handler).toBeDefined();
    });

    it('joins room and stores lineaId when lineaId is valid and line exists and is active', async () => {
      const lineaFixture = { id: 5, activo: true };
      const mockOrm = makeMockOrm(lineaFixture);
      registerBalanzaHandlers(io as Server, socket as Socket, mockOrm as unknown as MikroORM);
      const handler = getHandler(socket, 'join-linea');

      await handler(5);

      expect(mockOrm.em.fork).toHaveBeenCalledOnce();
      expect(socket.join).toHaveBeenCalledWith('linea-5');
      expect((socket.data as Record<string, unknown>).lineaId).toBe(5);
      expect(socket.emit).not.toHaveBeenCalledWith('error', expect.anything());
    });

    it('emits error and does not join when lineaId is not a positive integer', async () => {
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM);
      const handler = getHandler(socket, 'join-linea');

      await handler(-1);

      expect(orm.em.fork).not.toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    });

    it('emits error and does not join when lineaId is not an integer', async () => {
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM);
      const handler = getHandler(socket, 'join-linea');

      await handler(1.5);

      expect(orm.em.fork).not.toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    });

    it('emits error when line does not exist', async () => {
      const mockOrm = makeMockOrm(null); // findOne returns null
      registerBalanzaHandlers(io as Server, socket as Socket, mockOrm as unknown as MikroORM);
      const handler = getHandler(socket, 'join-linea');

      await handler(99);

      expect(socket.join).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.any(String) }));
    });

    it('emits error when line exists but is inactive', async () => {
      const mockOrm = makeMockOrm(null); // activo:false → findOne with activo:true returns null
      registerBalanzaHandlers(io as Server, socket as Socket, mockOrm as unknown as MikroORM);
      const handler = getHandler(socket, 'join-linea');

      await handler(3);

      expect(socket.join).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    });
  });

  describe('leave-linea', () => {
    it('registers leave-linea handler on socket', () => {
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM);
      expect(getHandler(socket, 'leave-linea')).toBeDefined();
    });

    it('leaves the room for the given lineaId', () => {
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM);
      const handler = getHandler(socket, 'leave-linea');

      handler(5);

      expect(socket.leave).toHaveBeenCalledWith('linea-5');
    });

    it('clears socket.data.lineaId when it matches', () => {
      (socket.data as Record<string, unknown>).lineaId = 5;
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM);
      const handler = getHandler(socket, 'leave-linea');

      handler(5);

      expect((socket.data as Record<string, unknown>).lineaId).toBeUndefined();
    });

    it('does not clear socket.data.lineaId when it does not match', () => {
      (socket.data as Record<string, unknown>).lineaId = 7;
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM);
      const handler = getHandler(socket, 'leave-linea');

      handler(5);

      expect((socket.data as Record<string, unknown>).lineaId).toBe(7);
    });
  });

  describe('balanza-data', () => {
    it('registers balanza-data handler on socket', () => {
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM);
      expect(getHandler(socket, 'balanza-data')).toBeDefined();
    });

    it('emits error and does not broadcast when socket is not a device', () => {
      (socket.data as Record<string, unknown>).lineaId = 5;
      // isDevice is intentionally absent (undefined)
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM);
      const handler = getHandler(socket, 'balanza-data');

      handler({ pesoNeto: 10 });

      expect(socket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ message: expect.stringContaining('Forbidden') }),
      );
      expect(io.to).not.toHaveBeenCalled();
    });

    it('broadcasts { pesoNeto } only to the room when payload is valid', () => {
      (socket.data as Record<string, unknown>).lineaId = 5;
      (socket.data as Record<string, unknown>).isDevice = true;
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM);
      const handler = getHandler(socket, 'balanza-data');

      handler({ pesoNeto: 42.5, isEstable: true }); // extra field must be stripped

      expect(io.to).toHaveBeenCalledWith('linea-5');
      const emitMock = (io as unknown as { _toEmit: ReturnType<typeof vi.fn> })._toEmit;
      expect(emitMock).toHaveBeenCalledWith('balanza-data', { pesoNeto: 42.5 });
      // Verify isEstable is NOT in the emitted payload
      const emittedPayload = emitMock.mock.calls[0][1];
      expect(emittedPayload).not.toHaveProperty('isEstable');
    });

    it('does not broadcast when pesoNeto is NaN', () => {
      (socket.data as Record<string, unknown>).lineaId = 5;
      (socket.data as Record<string, unknown>).isDevice = true;
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM);
      const handler = getHandler(socket, 'balanza-data');

      handler({ pesoNeto: NaN });

      expect(io.to).not.toHaveBeenCalled();
    });

    it('does not broadcast when pesoNeto is Infinity', () => {
      (socket.data as Record<string, unknown>).lineaId = 5;
      (socket.data as Record<string, unknown>).isDevice = true;
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM);
      const handler = getHandler(socket, 'balanza-data');

      handler({ pesoNeto: Infinity });

      expect(io.to).not.toHaveBeenCalled();
    });

    it('does not broadcast when socket.data.lineaId is not set', () => {
      (socket.data as Record<string, unknown>).lineaId = undefined;
      (socket.data as Record<string, unknown>).isDevice = true;
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM);
      const handler = getHandler(socket, 'balanza-data');

      handler({ pesoNeto: 10 });

      expect(io.to).not.toHaveBeenCalled();
    });

    it('broadcast payload contains ONLY pesoNeto — no isEstable', () => {
      (socket.data as Record<string, unknown>).lineaId = 2;
      (socket.data as Record<string, unknown>).isDevice = true;
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM);
      const handler = getHandler(socket, 'balanza-data');

      handler({ pesoNeto: 100, isEstable: false, extraField: 'x' });

      const emitMock = (io as unknown as { _toEmit: ReturnType<typeof vi.fn> })._toEmit;
      const emittedPayload = emitMock.mock.calls[0][1];
      expect(Object.keys(emittedPayload)).toEqual(['pesoNeto']);
    });
  });
});
