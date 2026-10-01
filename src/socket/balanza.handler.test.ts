import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Server, Socket } from 'socket.io';
import type { MikroORM } from '@mikro-orm/postgresql';
import type { SesionService, SesionActiva } from '../services/sesion.service.js';
import { registerBalanzaHandlers } from './balanza.handler.js';
import { deviceRegistryService } from '../services/device-registry.service.js';

vi.mock('../services/device-registry.service.js', () => ({
  deviceRegistryService: {
    registerDevice: vi.fn(),
    removeDevice: vi.fn(),
    hasDeviceForLinea: vi.fn(),
    getUnidad: vi.fn(),
    updateUnidadByHardwareId: vi.fn(),
    getDeviceForLinea: vi.fn(),
  },
}));

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

// ---- SesionService mock helpers ----

const makeActiveSesion = (overrides: Partial<SesionActiva> = {}): SesionActiva => ({
  lineaProduccionId: 5,
  usuarioId: 1,
  usuarioRol: null,
  pasadaId: null,
  connectedAt: new Date(),
  ultimaActividadAt: new Date(),
  warningSent: false,
  ...overrides,
});

// Default: returns an ACTIVE operator session so existing broadcast tests still pass.
const makeMockSesionService = (
  obtenerSesionResult: SesionActiva | null = makeActiveSesion(),
) =>
  ({
    obtenerSesion: vi.fn().mockReturnValue(obtenerSesionResult),
  }) as unknown as SesionService;

describe('registerBalanzaHandlers', () => {
  let io: ReturnType<typeof makeMockIo>;
  let socket: ReturnType<typeof makeMockSocket>;
  let orm: ReturnType<typeof makeMockOrm>;
  let sesionService: SesionService;

  beforeEach(() => {
    io = makeMockIo();
    socket = makeMockSocket();
    orm = makeMockOrm();
    sesionService = makeMockSesionService();
    vi.clearAllMocks();
    // Default: device resolved as kg (identity conversion) unless a test
    // overrides this to exercise the g→kg conversion or fail-closed paths.
    vi.mocked(deviceRegistryService.getUnidad).mockReturnValue('kg');
  });

  describe('join-linea', () => {
    it('registers join-linea handler on socket', () => {
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, sesionService);
      const handler = getHandler(socket, 'join-linea');
      expect(handler).toBeDefined();
    });

    it('joins room and stores lineaId when lineaId is valid and line exists and is active', async () => {
      const lineaFixture = { id: 5, activo: true };
      const mockOrm = makeMockOrm(lineaFixture);
      // Provide an authenticated user so the guard passes
      const authenticatedSocket = makeMockSocket({
        data: { user: { id: 1, nombreUsuario: 'testuser' } } as Socket['data'],
      });
      registerBalanzaHandlers(io as Server, authenticatedSocket as Socket, mockOrm as unknown as MikroORM, sesionService);
      const handler = getHandler(authenticatedSocket, 'join-linea');

      await handler(5);

      expect(mockOrm.em.fork).toHaveBeenCalledOnce();
      expect(authenticatedSocket.join).toHaveBeenCalledWith('linea-5');
      expect((authenticatedSocket.data as Record<string, unknown>).lineaId).toBe(5);
      expect(authenticatedSocket.emit).not.toHaveBeenCalledWith('error', expect.anything());
    });

    it('emits error and does not join when lineaId is not a positive integer', async () => {
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, sesionService);
      const handler = getHandler(socket, 'join-linea');

      await handler(-1);

      expect(orm.em.fork).not.toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    });

    it('emits error and does not join when lineaId is not an integer', async () => {
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, sesionService);
      const handler = getHandler(socket, 'join-linea');

      await handler(1.5);

      expect(orm.em.fork).not.toHaveBeenCalled();
      expect(socket.join).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    });

    it('emits error when line does not exist', async () => {
      const mockOrm = makeMockOrm(null); // findOne returns null
      const authenticatedSocket = makeMockSocket({
        data: { user: { id: 1, nombreUsuario: 'testuser' } } as Socket['data'],
      });
      registerBalanzaHandlers(io as Server, authenticatedSocket as Socket, mockOrm as unknown as MikroORM, sesionService);
      const handler = getHandler(authenticatedSocket, 'join-linea');

      await handler(99);

      expect(authenticatedSocket.join).not.toHaveBeenCalled();
      expect(authenticatedSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.any(String) }));
    });

    it('emits error when line exists but is inactive', async () => {
      const mockOrm = makeMockOrm(null); // activo:false → findOne with activo:true returns null
      const authenticatedSocket = makeMockSocket({
        data: { user: { id: 1, nombreUsuario: 'testuser' } } as Socket['data'],
      });
      registerBalanzaHandlers(io as Server, authenticatedSocket as Socket, mockOrm as unknown as MikroORM, sesionService);
      const handler = getHandler(authenticatedSocket, 'join-linea');

      await handler(3);

      expect(authenticatedSocket.join).not.toHaveBeenCalled();
      expect(authenticatedSocket.emit).toHaveBeenCalledWith('error', expect.any(Object));
    });

    it('emits error and does not join when socket.data.user is undefined (unauthenticated tablet)', async () => {
      const lineaFixture = { id: 5, activo: true };
      const mockOrm = makeMockOrm(lineaFixture);
      // socket has no isDevice and no user — unauthenticated
      const unauthSocket = makeMockSocket({ data: {} as Record<string, unknown> });
      registerBalanzaHandlers(io as Server, unauthSocket as Socket, mockOrm as unknown as MikroORM, sesionService);
      const handler = getHandler(unauthSocket, 'join-linea');

      await handler(5);

      expect(unauthSocket.join).not.toHaveBeenCalled();
      expect(unauthSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.any(String) }));
    });

    it('emits error and does not join when socket is a device (devices must be paired via handleDeviceConnection, not join-linea)', async () => {
      const lineaFixture = { id: 5, activo: true };
      const mockOrm = makeMockOrm(lineaFixture);
      const deviceSocket = makeMockSocket({
        data: { isDevice: true, hardwareId: 'fake-hardware-id' } as Socket['data'],
      });
      registerBalanzaHandlers(io as Server, deviceSocket as Socket, mockOrm as unknown as MikroORM, sesionService);
      const handler = getHandler(deviceSocket, 'join-linea');

      await handler(5);

      expect(mockOrm.em.fork).not.toHaveBeenCalled();
      expect(deviceSocket.join).not.toHaveBeenCalled();
      expect(deviceSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.any(String) }));
    });

    it('emits balanza-status to tablet socket based on deviceRegistryService when a tablet joins', async () => {
      const lineaFixture = { id: 5, activo: true };
      const mockOrm = makeMockOrm(lineaFixture);
      const tabletSocket = makeMockSocket({
        data: { user: { id: 1, nombreUsuario: 'test' } } as Socket['data'],
      });
      vi.mocked(deviceRegistryService.getDeviceForLinea).mockReturnValue(undefined);

      registerBalanzaHandlers(io as Server, tabletSocket as Socket, mockOrm as unknown as MikroORM, sesionService);
      const handler = getHandler(tabletSocket, 'join-linea');

      await handler(5);

      expect(deviceRegistryService.getDeviceForLinea).toHaveBeenCalledWith(5);
      expect(tabletSocket.emit).toHaveBeenCalledWith('balanza-status', { isConnected: false });
    });

    it('emits balanza-status with hardwareId and unidad when a device is connected for the línea', async () => {
      const lineaFixture = { id: 5, activo: true };
      const mockOrm = makeMockOrm(lineaFixture);
      const tabletSocket = makeMockSocket({
        data: { user: { id: 1, nombreUsuario: 'test' } } as Socket['data'],
      });
      vi.mocked(deviceRegistryService.getDeviceForLinea).mockReturnValue({
        socketId: 'device-socket-1',
        lineaId: 5,
        hardwareId: 'hw-5',
        unidad: 'g',
        timestamp: new Date(),
      });

      registerBalanzaHandlers(io as Server, tabletSocket as Socket, mockOrm as unknown as MikroORM, sesionService);
      const handler = getHandler(tabletSocket, 'join-linea');

      await handler(5);

      expect(tabletSocket.emit).toHaveBeenCalledWith('balanza-status', {
        isConnected: true,
        hardwareId: 'hw-5',
        unidad: 'g',
      });
    });
  });

  describe('leave-linea', () => {
    it('registers leave-linea handler on socket', () => {
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, sesionService);
      expect(getHandler(socket, 'leave-linea')).toBeDefined();
    });

    it('leaves the room for the given lineaId', () => {
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, sesionService);
      const handler = getHandler(socket, 'leave-linea');

      handler(5);

      expect(socket.leave).toHaveBeenCalledWith('linea-5');
    });

    it('does not leave the room when lineaId is not a positive integer', () => {
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, sesionService);
      const handler = getHandler(socket, 'leave-linea');

      handler(-1);

      expect(socket.leave).not.toHaveBeenCalled();
    });

    it('clears socket.data.lineaId when it matches', () => {
      (socket.data as Record<string, unknown>).lineaId = 5;
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, sesionService);
      const handler = getHandler(socket, 'leave-linea');

      handler(5);

      expect((socket.data as Record<string, unknown>).lineaId).toBeUndefined();
    });

    it('does not clear socket.data.lineaId when it does not match', () => {
      (socket.data as Record<string, unknown>).lineaId = 7;
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, sesionService);
      const handler = getHandler(socket, 'leave-linea');

      handler(5);

      expect((socket.data as Record<string, unknown>).lineaId).toBe(7);
    });

  });

  describe('disconnect', () => {
    it('registers disconnect handler on socket', () => {
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, sesionService);
      expect(getHandler(socket, 'disconnect')).toBeDefined();
    });

    it('emits balanza-status false to room when a device disconnects', () => {
      (socket.data as Record<string, unknown>).lineaId = 5;
      (socket.data as Record<string, unknown>).isDevice = true;
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, sesionService);
      const handler = getHandler(socket, 'disconnect');

      handler();

      expect(io.to).toHaveBeenCalledWith('linea-5');
      const emitMock = (io as unknown as { _toEmit: ReturnType<typeof vi.fn> })._toEmit;
      expect(emitMock).toHaveBeenCalledWith('balanza-status', { isConnected: false });
    });
  });

  describe('balanza-data', () => {
    it('registers balanza-data handler on socket', () => {
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, sesionService);
      expect(getHandler(socket, 'balanza-data')).toBeDefined();
    });

    it('emits error and does not broadcast when socket is not a device', () => {
      (socket.data as Record<string, unknown>).lineaId = 5;
      // isDevice is intentionally absent (undefined)
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, sesionService);
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
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, sesionService);
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
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, sesionService);
      const handler = getHandler(socket, 'balanza-data');

      handler({ pesoNeto: NaN });

      expect(io.to).not.toHaveBeenCalled();
    });

    it('does not broadcast when pesoNeto is Infinity', () => {
      (socket.data as Record<string, unknown>).lineaId = 5;
      (socket.data as Record<string, unknown>).isDevice = true;
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, sesionService);
      const handler = getHandler(socket, 'balanza-data');

      handler({ pesoNeto: Infinity });

      expect(io.to).not.toHaveBeenCalled();
    });

    it('does not broadcast when socket.data.lineaId is not set', () => {
      (socket.data as Record<string, unknown>).lineaId = undefined;
      (socket.data as Record<string, unknown>).isDevice = true;
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, sesionService);
      const handler = getHandler(socket, 'balanza-data');

      handler({ pesoNeto: 10 });

      expect(io.to).not.toHaveBeenCalled();
    });

    it('broadcast payload contains ONLY pesoNeto — no isEstable', () => {
      (socket.data as Record<string, unknown>).lineaId = 2;
      (socket.data as Record<string, unknown>).isDevice = true;
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, sesionService);
      const handler = getHandler(socket, 'balanza-data');

      handler({ pesoNeto: 100, isEstable: false, extraField: 'x' });

      const emitMock = (io as unknown as { _toEmit: ReturnType<typeof vi.fn> })._toEmit;
      const emittedPayload = emitMock.mock.calls[0][1];
      expect(Object.keys(emittedPayload)).toEqual(['pesoNeto']);
    });

    // ---- Unit resolution / conversion tests (sdd/unidad-medida-peso) ----

    it('converts pesoNeto to kg when the device unidad is g', () => {
      (socket.data as Record<string, unknown>).lineaId = 5;
      (socket.data as Record<string, unknown>).isDevice = true;
      (socket.data as Record<string, unknown>).hardwareId = 'hw-g-device';
      vi.mocked(deviceRegistryService.getUnidad).mockReturnValue('g');
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, sesionService);
      const handler = getHandler(socket, 'balanza-data');

      handler({ pesoNeto: 220.0 });

      expect(deviceRegistryService.getUnidad).toHaveBeenCalledWith(socket.id);
      const emitMock = (io as unknown as { _toEmit: ReturnType<typeof vi.fn> })._toEmit;
      expect(emitMock).toHaveBeenCalledWith('balanza-data', { pesoNeto: 0.22 });
    });

    it('passes pesoNeto through unchanged when the device unidad is kg', () => {
      (socket.data as Record<string, unknown>).lineaId = 5;
      (socket.data as Record<string, unknown>).isDevice = true;
      (socket.data as Record<string, unknown>).hardwareId = 'hw-kg-device';
      vi.mocked(deviceRegistryService.getUnidad).mockReturnValue('kg');
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, sesionService);
      const handler = getHandler(socket, 'balanza-data');

      handler({ pesoNeto: 0.22 });

      const emitMock = (io as unknown as { _toEmit: ReturnType<typeof vi.fn> })._toEmit;
      expect(emitMock).toHaveBeenCalledWith('balanza-data', { pesoNeto: 0.22 });
    });

    it('rejects the sample and emits an error naming hardwareId when the device unidad is missing (undefined)', () => {
      (socket.data as Record<string, unknown>).lineaId = 5;
      (socket.data as Record<string, unknown>).isDevice = true;
      (socket.data as Record<string, unknown>).hardwareId = 'hw-no-unit';
      vi.mocked(deviceRegistryService.getUnidad).mockReturnValue(undefined);
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, sesionService);
      const handler = getHandler(socket, 'balanza-data');

      handler({ pesoNeto: 10 });

      expect(io.to).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ message: expect.stringContaining('hw-no-unit') }),
      );
    });

    it('rejects the sample and emits an error naming hardwareId when the device unidad is unrecognized', () => {
      (socket.data as Record<string, unknown>).lineaId = 5;
      (socket.data as Record<string, unknown>).isDevice = true;
      (socket.data as Record<string, unknown>).hardwareId = 'hw-bad-unit';
      vi.mocked(deviceRegistryService.getUnidad).mockReturnValue('lb' as never);
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, sesionService);
      const handler = getHandler(socket, 'balanza-data');

      handler({ pesoNeto: 10 });

      expect(io.to).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ message: expect.stringContaining('hw-bad-unit') }),
      );
    });

    // ---- Optional frame unit (peso-unidad-en-trama) ----

    describe('frame unidad', () => {
      const setupDevice = (deviceUnidad: 'g' | 'kg' | undefined, hardwareId = 'hw-frame') => {
        (socket.data as Record<string, unknown>).lineaId = 5;
        (socket.data as Record<string, unknown>).isDevice = true;
        (socket.data as Record<string, unknown>).hardwareId = hardwareId;
        vi.mocked(deviceRegistryService.getUnidad).mockReturnValue(deviceUnidad);
        registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, sesionService);
        return getHandler(socket, 'balanza-data');
      };
      const getEmit = () => (io as unknown as { _toEmit: ReturnType<typeof vi.fn> })._toEmit;

      it.each(['g', 'kg'] as const)(
        'converts 69.2 g to 0.0692 kg when the frame unit is g and the device unit is %s',
        (deviceUnidad) => {
          vi.spyOn(console, 'warn').mockImplementation(() => {});
          const handler = setupDevice(deviceUnidad);

          handler({ pesoNeto: 69.2, unidad: 'g' });

          expect(getEmit()).toHaveBeenCalledWith('balanza-data', { pesoNeto: 0.0692 });
        },
      );

      it('warns once with hardwareId, frame unit and device unit when units differ, and uses the frame unit', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const handler = setupDevice('kg', 'hw-mismatch');

        handler({ pesoNeto: 220, unidad: 'g' });

        expect(getEmit()).toHaveBeenCalledWith('balanza-data', { pesoNeto: 0.22 });
        expect(warn).toHaveBeenCalledTimes(1);
        const message = String(warn.mock.calls[0][0]);
        expect(message).toContain('hw-mismatch');
        expect(message).toContain('g');
        expect(message).toContain('kg');
      });

      it('does not warn again for a second mismatching frame on the same socket', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const handler = setupDevice('kg');

        handler({ pesoNeto: 220, unidad: 'g' });
        handler({ pesoNeto: 230, unidad: 'g' });

        expect(warn).toHaveBeenCalledTimes(1);
        expect(getEmit()).toHaveBeenCalledTimes(2);
      });

      it('does not warn when the frame unit equals the device unit', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const handler = setupDevice('g');

        handler({ pesoNeto: 220, unidad: 'g' });

        expect(warn).not.toHaveBeenCalled();
        expect(getEmit()).toHaveBeenCalledWith('balanza-data', { pesoNeto: 0.22 });
      });

      it('uses the device unit and does not warn when the frame has no unit', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const handler = setupDevice('g');

        handler({ pesoNeto: 220 });

        expect(warn).not.toHaveBeenCalled();
        expect(getEmit()).toHaveBeenCalledWith('balanza-data', { pesoNeto: 0.22 });
      });

      it.each(['lb', 123, null])('rejects an invalid frame unit (%s) with an error and no broadcast', (bad) => {
        const handler = setupDevice('kg');

        handler({ pesoNeto: 10, unidad: bad });

        expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ message: expect.any(String) }));
        expect(io.to).not.toHaveBeenCalled();
      });

      it('still rejects (fail-closed) when the device has no configured unit, even if the frame carries one', () => {
        const handler = setupDevice(undefined, 'hw-no-unit-frame');

        handler({ pesoNeto: 10, unidad: 'g' });

        expect(io.to).not.toHaveBeenCalled();
        expect(socket.emit).toHaveBeenCalledWith(
          'error',
          expect.objectContaining({ message: expect.stringContaining('hw-no-unit-frame') }),
        );
      });

      it('broadcasts only pesoNeto, never the frame unit', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const handler = setupDevice('kg');

        handler({ pesoNeto: 5, unidad: 'g' });

        expect(Object.keys(getEmit().mock.calls[0][1])).toEqual(['pesoNeto']);
      });
    });

    // ---- Live unidad correction / cache invalidation (sdd/unidad-medida-peso Part B) ----
    // Critical, non-parallel-safe: proves the correction takes effect on the very
    // next frame from the SAME socket, with NO disconnect/re-pair in between.
    it('applies a live unidad correction to the very next frame on the same socket, with no reconnect (critical: no-reconnect invalidation)', () => {
      (socket.data as Record<string, unknown>).lineaId = 5;
      (socket.data as Record<string, unknown>).isDevice = true;
      (socket.data as Record<string, unknown>).hardwareId = 'hw-live-correction';

      // Emulate the write-through cache: getUnidad reads whatever
      // updateUnidadByHardwareId last wrote, exactly like the real
      // DeviceRegistryService's in-memory Map (unit-tested separately in
      // device-registry.service.test.ts).
      let currentUnidad: 'g' | 'kg' = 'kg';
      vi.mocked(deviceRegistryService.getUnidad).mockImplementation(() => currentUnidad);
      vi.mocked(deviceRegistryService.updateUnidadByHardwareId).mockImplementation(
        (hardwareId: string, unidad: 'g' | 'kg') => {
          if (hardwareId !== 'hw-live-correction') return false;
          currentUnidad = unidad;
          return true;
        },
      );

      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, sesionService);
      const handler = getHandler(socket, 'balanza-data');
      const emitMock = (io as unknown as { _toEmit: ReturnType<typeof vi.fn> })._toEmit;

      // First frame: still cached as kg, unconverted.
      handler({ pesoNeto: 220 });
      expect(emitMock).toHaveBeenLastCalledWith('balanza-data', { pesoNeto: 220 });

      // Live correction applied — no socket disconnect/re-pair anywhere in this test.
      const applied = deviceRegistryService.updateUnidadByHardwareId('hw-live-correction', 'g');
      expect(applied).toBe(true);

      // Very next frame on the SAME socket: converted with the corrected factor.
      handler({ pesoNeto: 220 });
      expect(emitMock).toHaveBeenLastCalledWith('balanza-data', { pesoNeto: 0.22 });
    });

    // ---- Session guard tests (RF-15) ----

    it('does not broadcast when there is no active session — null (puesta a punto)', () => {
      (socket.data as Record<string, unknown>).lineaId = 5;
      (socket.data as Record<string, unknown>).isDevice = true;
      const noSesion = makeMockSesionService(null);
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, noSesion);
      const handler = getHandler(socket, 'balanza-data');

      handler({ pesoNeto: 10 });

      expect(io.to).not.toHaveBeenCalled();
      expect(socket.emit).not.toHaveBeenCalledWith('error', expect.anything());
    });

    it('does not broadcast when session exists but operator timed out (usuarioId === null)', () => {
      (socket.data as Record<string, unknown>).lineaId = 5;
      (socket.data as Record<string, unknown>).isDevice = true;
      const timedOutSesion = makeMockSesionService(makeActiveSesion({ usuarioId: null }));
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, timedOutSesion);
      const handler = getHandler(socket, 'balanza-data');

      handler({ pesoNeto: 10 });

      expect(io.to).not.toHaveBeenCalled();
      expect(socket.emit).not.toHaveBeenCalledWith('error', expect.anything());
    });

    it('broadcasts { pesoNeto } when session has an active operator (usuarioId !== null)', () => {
      (socket.data as Record<string, unknown>).lineaId = 5;
      (socket.data as Record<string, unknown>).isDevice = true;
      const activeSesion = makeMockSesionService(makeActiveSesion({ usuarioId: 42 }));
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, activeSesion);
      const handler = getHandler(socket, 'balanza-data');

      handler({ pesoNeto: 99 });

      expect(io.to).toHaveBeenCalledWith('linea-5');
      const emitMock = (io as unknown as { _toEmit: ReturnType<typeof vi.fn> })._toEmit;
      expect(emitMock).toHaveBeenCalledWith('balanza-data', { pesoNeto: 99 });
    });

    it('calls obtenerSesion exactly once per balanza-data event', () => {
      (socket.data as Record<string, unknown>).lineaId = 5;
      (socket.data as Record<string, unknown>).isDevice = true;
      const activeSesion = makeMockSesionService(makeActiveSesion());
      registerBalanzaHandlers(io as Server, socket as Socket, orm as unknown as MikroORM, activeSesion);
      const handler = getHandler(socket, 'balanza-data');

      handler({ pesoNeto: 15 });

      expect((activeSesion as unknown as { obtenerSesion: ReturnType<typeof vi.fn> }).obtenerSesion).toHaveBeenCalledOnce();
      expect((activeSesion as unknown as { obtenerSesion: ReturnType<typeof vi.fn> }).obtenerSesion).toHaveBeenCalledWith(5);
    });
  });
});
