import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import type { Server } from 'socket.io';
import type { MikroORM } from '@mikro-orm/postgresql';
import { createLineaContextResolver } from './linea-context.service.js';

describe('createLineaContextResolver', () => {
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
    const ctx = await createLineaContextResolver(io, orm)(5);
    expect(ctx).toMatchObject({ tabletSockets: 2, lineaNombre: 'Linea 5', rbNombre: 'RB-05', rbHardwareId: 'hw-5' });
    expect(ctx.rbConnected).toBe(false);
  });

  it('keeps registry/room data when the DB lookup fails', async () => {
    const io = makeIo(['b'], { b: false });
    const orm = {
      em: { fork: () => ({ findOne: vi.fn().mockRejectedValue(new Error('db down')) }) },
    } as unknown as MikroORM;
    const ctx = await createLineaContextResolver(io, orm)(5);
    expect(ctx.tabletSockets).toBe(1);
    expect(ctx.lineaNombre).toBeUndefined();
  });

  it('uses the injected registry and prefers its hardwareId over the DB one', async () => {
    const io = makeIo([], {});
    const orm = {
      em: {
        fork: () => ({
          findOne: vi.fn().mockResolvedValue({ nombre: 'Linea 5', dispositivo: { nombre: 'RB-05', hardwareId: 'hw-db' } }),
        }),
      },
    } as unknown as MikroORM;
    const registry = { getDeviceForLinea: vi.fn().mockReturnValue({ hardwareId: 'hw-reg' }) };
    const ctx = await createLineaContextResolver(io, orm, registry as never)(5);
    expect(registry.getDeviceForLinea).toHaveBeenCalledWith(5);
    expect(ctx.rbConnected).toBe(true);
    expect(ctx.rbHardwareId).toBe('hw-reg');
  });

  describe('RB socket facts', () => {
    const orm = { em: { fork: () => ({ findOne: vi.fn().mockResolvedValue(null) }) } } as unknown as MikroORM;
    const registry = { getDeviceForLinea: vi.fn().mockReturnValue({ socketId: 'rb-1', hardwareId: 'hw-1' }) };
    const makeIoWithRb = (rbSocket: { connected: boolean; rooms: Set<string> } | undefined) =>
      ({
        sockets: {
          adapter: { rooms: new Map([['linea-5', new Set(['rb-1'])]]) },
          sockets: new Map(rbSocket ? [['rb-1', { data: { isDevice: true }, ...rbSocket }]] : []),
        },
      }) as unknown as Server;

    it('reports an active RB socket that is in the línea room', async () => {
      const io = makeIoWithRb({ connected: true, rooms: new Set(['rb-1', 'linea-5']) });
      const ctx = await createLineaContextResolver(io, orm, registry as never)(5);
      expect(ctx).toMatchObject({ rbConnected: true, rbSocketActivo: true, rbEnSala: true });
    });

    it('reports an active RB socket that is not in the room', async () => {
      const io = makeIoWithRb({ connected: true, rooms: new Set(['rb-1']) });
      const ctx = await createLineaContextResolver(io, orm, registry as never)(5);
      expect(ctx).toMatchObject({ rbSocketActivo: true, rbEnSala: false });
    });

    it('reports a disconnected RB socket as inactive', async () => {
      const io = makeIoWithRb({ connected: false, rooms: new Set(['linea-5']) });
      const ctx = await createLineaContextResolver(io, orm, registry as never)(5);
      expect(ctx).toMatchObject({ rbSocketActivo: false, rbEnSala: true });
    });

    it('reports both false when the registered RB socket cannot be found', async () => {
      const ctx = await createLineaContextResolver(makeIoWithRb(undefined), orm, registry as never)(5);
      expect(ctx).toMatchObject({ rbConnected: true, rbSocketActivo: false, rbEnSala: false });
    });

    it('leaves the RB socket facts unset when no RB is registered', async () => {
      const none = { getDeviceForLinea: vi.fn().mockReturnValue(undefined) };
      const ctx = await createLineaContextResolver(makeIoWithRb(undefined), orm, none as never)(5);
      expect(ctx.rbConnected).toBe(false);
      expect(ctx.rbSocketActivo).toBeUndefined();
      expect(ctx.rbEnSala).toBeUndefined();
    });
  });

  describe('RB beacon facts', () => {
    const orm = {
      em: {
        fork: () => ({
          findOne: vi.fn().mockResolvedValue({ nombre: 'Linea 5', dispositivo: { nombre: 'RB-05', hardwareId: 'hw-db' } }),
        }),
      },
    } as unknown as MikroORM;
    const io = makeIo([], {});
    const beacon = (snapshot: unknown) => ({ get: vi.fn().mockReturnValue(snapshot), isFresh: vi.fn().mockReturnValue(true) });

    it('reports encendido with beacon facts for a DB-resolved hardwareId with no socket', async () => {
      const beacons = beacon({ lastSeenAt: 1, ageMs: 7000, uptimeS: 3600, throttled: '0x50005', tempC: 55 });
      const registry = { getDeviceForLinea: vi.fn().mockReturnValue(undefined) };
      const ctx = await createLineaContextResolver(io, orm, registry as never, beacons as never)(5);
      expect(beacons.get).toHaveBeenCalledWith('hw-db');
      expect(ctx).toMatchObject({
        rbEstado: 'encendido',
        rbBeaconHaceMs: 7000,
        rbUptimeS: 3600,
        rbThrottled: '0x50005',
        rbTempC: 55,
      });
    });

    it('reports conectado when the RB socket is registered', async () => {
      const beacons = beacon(undefined);
      const registry = { getDeviceForLinea: vi.fn().mockReturnValue({ socketId: 's', hardwareId: 'hw-reg' }) };
      const ctx = await createLineaContextResolver(io, orm, registry as never, beacons as never)(5);
      expect(ctx.rbEstado).toBe('conectado');
      expect(ctx.rbBeaconHaceMs).toBeUndefined();
    });

    it('reports desconectado when there is no socket and no fresh beacon, keeping stale facts', async () => {
      const beacons = {
        get: vi.fn().mockReturnValue({ lastSeenAt: 1, ageMs: 900000, uptimeS: 10 }),
        isFresh: vi.fn().mockReturnValue(false),
      };
      const registry = { getDeviceForLinea: vi.fn().mockReturnValue(undefined) };
      const ctx = await createLineaContextResolver(io, orm, registry as never, beacons as never)(5);
      expect(ctx).toMatchObject({ rbEstado: 'desconectado', rbBeaconHaceMs: 900000, rbUptimeS: 10 });
    });

    it('leaves beacon facts unset when no hardwareId can be resolved', async () => {
      const emptyOrm = { em: { fork: () => ({ findOne: vi.fn().mockResolvedValue(null) }) } } as unknown as MikroORM;
      const beacons = beacon(undefined);
      const registry = { getDeviceForLinea: vi.fn().mockReturnValue(undefined) };
      const ctx = await createLineaContextResolver(io, emptyOrm, registry as never, beacons as never)(5);
      expect(ctx.rbEstado).toBeUndefined();
      expect(beacons.get).not.toHaveBeenCalled();
    });

    it('never fails the context when the beacon service throws', async () => {
      const beacons = {
        get: vi.fn().mockImplementation(() => {
          throw new Error('boom');
        }),
        isFresh: vi.fn(),
      };
      const registry = { getDeviceForLinea: vi.fn().mockReturnValue(undefined) };
      const ctx = await createLineaContextResolver(io, orm, registry as never, beacons as never)(5);
      expect(ctx.lineaNombre).toBe('Linea 5');
      expect(ctx.rbEstado).toBeUndefined();
    });
  });
});
