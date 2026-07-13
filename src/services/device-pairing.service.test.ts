import 'reflect-metadata';
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { MikroORM, SchemaGenerator } from '@mikro-orm/postgresql';
import type { EntityManager } from '@mikro-orm/core';
import config from '../../mikro-orm.config.js';
import {
  Usuario,
  LineaProduccion,
  Articulo,
  Etapa,
  RutaPasada,
  ArticuloRutaPasada,
  RutaPasadaEtapa,
  Pasada,
  Muestra,
  Dispositivo,
} from '../models/index.js';
import {
  findLineaByHardwareId,
  assignHardwareIdToLinea,
  findDispositivoByHardwareId,
} from './device-pairing.service.js';

describe('device-pairing.service', () => {
  let orm: MikroORM;
  let em: EntityManager;

  let lineaA: LineaProduccion;
  let lineaB: LineaProduccion;
  let lineaInactiva: LineaProduccion;

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...config,
      dbName: 'control_pesaje_test',
      extensions: [SchemaGenerator],
      entities: [
        Usuario,
        LineaProduccion,
        Articulo,
        Etapa,
        RutaPasada,
        ArticuloRutaPasada,
        RutaPasadaEtapa,
        Pasada,
        Muestra,
        Dispositivo,
      ],
      entitiesTs: [],
      allowGlobalContext: true,
    });

    const generator = orm.schema;
    await generator.ensureDatabase();
    await generator.drop();
    await generator.create();
  });

  afterAll(async () => {
    if (orm) {
      await orm.close();
    }
  });

  beforeEach(async () => {
    em = orm.em.fork();
    await em.nativeDelete(Dispositivo, {});
    await em.nativeDelete(LineaProduccion, {});

    lineaA = new LineaProduccion();
    lineaA.nombre = 'Linea A';

    lineaB = new LineaProduccion();
    lineaB.nombre = 'Linea B';

    lineaInactiva = new LineaProduccion();
    lineaInactiva.nombre = 'Linea Inactiva';
    lineaInactiva.activo = false;

    await em.persist([lineaA, lineaB, lineaInactiva]).flush();

    em.create(Dispositivo, { hardwareId: 'hw-aaaa', lineaProduccion: lineaA, nombre: 'Pi-hw-a' });
    em.create(Dispositivo, { hardwareId: 'hw-inactiva', lineaProduccion: lineaInactiva, nombre: 'Pi-hw-i' });
    await em.flush();
  });

  describe('findLineaByHardwareId', () => {
    it('returns the active línea matching the hardwareId (resolved via Dispositivo)', async () => {
      const result = await findLineaByHardwareId(em, 'hw-aaaa');
      expect(result).not.toBeNull();
      expect(result!.id).toBe(lineaA.id);
    });

    it('returns null when no Dispositivo matches the hardwareId', async () => {
      const result = await findLineaByHardwareId(em, 'hw-does-not-exist');
      expect(result).toBeNull();
    });

    it('returns null when the matching línea is inactive (activo: false)', async () => {
      const result = await findLineaByHardwareId(em, 'hw-inactiva');
      expect(result).toBeNull();
    });

    it('returns null when the Dispositivo exists but has no línea assigned', async () => {
      em.create(Dispositivo, { hardwareId: 'hw-unassigned', nombre: 'Pi-hw-u' });
      await em.flush();

      const result = await findLineaByHardwareId(em, 'hw-unassigned');
      expect(result).toBeNull();
    });
  });

  describe('findDispositivoByHardwareId', () => {
    it('returns the Dispositivo with lineaProduccion populated', async () => {
      const result = await findDispositivoByHardwareId(em, 'hw-aaaa');
      expect(result).not.toBeNull();
      expect(result!.lineaProduccion!.id).toBe(lineaA.id);
    });

    it('returns null when no Dispositivo matches the hardwareId', async () => {
      const result = await findDispositivoByHardwareId(em, 'hw-does-not-exist');
      expect(result).toBeNull();
    });
  });

  describe('assignHardwareIdToLinea', () => {
    it('assigns the hardwareId to a línea with no prior holder (creates Dispositivo)', async () => {
      const result = await assignHardwareIdToLinea(em, lineaB.id, 'hw-new-device');
      expect(result).not.toBeNull();
      expect(result!.linea.id).toBe(lineaB.id);
      expect(result!.dispositivo.hardwareId).toBe('hw-new-device');

      em.clear();
      const reloaded = await em.findOne(Dispositivo, { hardwareId: 'hw-new-device' }, { populate: ['lineaProduccion'] });
      expect(reloaded!.lineaProduccion!.id).toBe(lineaB.id);
    });

    it('throws validation error when the device is already assigned to another línea', async () => {
      await expect(assignHardwareIdToLinea(em, lineaB.id, 'hw-aaaa')).rejects.toThrow(
        'Validation Error: El dispositivo ya está asignado a otra línea'
      );
    });

    it('throws validation error when the target línea is already assigned to another device', async () => {
      await expect(assignHardwareIdToLinea(em, lineaA.id, 'hw-brand-new')).rejects.toThrow(
        'Validation Error: La línea ya tiene un dispositivo asignado'
      );
    });

    it('returns null when the target lineaId does not exist', async () => {
      const result = await assignHardwareIdToLinea(em, 999999, 'hw-orphan');
      expect(result).toBeNull();
    });

    it('is idempotent when reassigning a hardwareId to its own current línea', async () => {
      const result = await assignHardwareIdToLinea(em, lineaA.id, 'hw-aaaa');
      expect(result).not.toBeNull();
      expect(result!.linea.id).toBe(lineaA.id);
      expect(result!.dispositivo.hardwareId).toBe('hw-aaaa');

      em.clear();
      const dispositivo = await em.findOne(Dispositivo, { hardwareId: 'hw-aaaa' }, { populate: ['lineaProduccion'] });
      expect(dispositivo!.lineaProduccion!.id).toBe(lineaA.id);
    });

    describe('Dispositivo upsert', () => {
      it('creates a new Dispositivo row on first-time assignment', async () => {
        const result = await assignHardwareIdToLinea(em, lineaB.id, 'hw-new-device');
        expect(result).not.toBeNull();

        em.clear();
        const dispositivo = await em.findOne(Dispositivo, { hardwareId: 'hw-new-device' }, { populate: ['lineaProduccion'] });
        expect(dispositivo).not.toBeNull();
        expect(dispositivo!.lineaProduccion!.id).toBe(lineaB.id);
      });



      it('does not touch the Dispositivo table when the guard clause returns early (target línea missing)', async () => {
        await expect(assignHardwareIdToLinea(em, 999999, 'hw-orphan-device')).resolves.toBeNull();

        em.clear();
        const dispositivo = await em.findOne(Dispositivo, { hardwareId: 'hw-orphan-device' });
        expect(dispositivo).toBeNull();
      });

      it('rolls back the Dispositivo upsert on a genuine mid-transaction failure', async () => {
        // Force a real failure DURING the Dispositivo upsert branch by making
        // `em.create(Dispositivo, ...)` throw. Proves the whole transaction
        // rolls back.
        const target = lineaB;
        const hardwareId = 'hw-mid-tx-failure';

        // `em.transactional(cb)` invokes `cb` with a FORKED EntityManager
        // (not `em` itself), so spying on the `em` instance directly would
        // not intercept the fork's `.create()` call. Spying on the shared
        // prototype ensures the fork (which shares the same prototype
        // chain) is intercepted too.
        const emProto = Object.getPrototypeOf(em);
        const originalCreate = emProto.create;
        const createSpy = vi
          .spyOn(emProto, 'create')
          .mockImplementation(function (
            this: unknown,
            entityName: unknown,
            data: unknown,
            ...rest: unknown[]
          ) {
            if (entityName === Dispositivo) {
              throw new Error('Simulated mid-transaction failure during Dispositivo upsert');
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (originalCreate as any).call(this, entityName, data, ...rest);
          });

        await expect(assignHardwareIdToLinea(em, target.id, hardwareId)).rejects.toThrow(
          'Simulated mid-transaction failure during Dispositivo upsert'
        );

        createSpy.mockRestore();

        em.clear();
        const dispositivo = await em.findOne(Dispositivo, { hardwareId });
        expect(dispositivo).toBeNull();
      });
    });
  });
});
