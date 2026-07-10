import 'reflect-metadata';
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
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
} from '../models/index.js';
import { findLineaByHardwareId, assignHardwareIdToLinea } from './device-pairing.service.js';

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
    await em.nativeDelete(LineaProduccion, {});

    lineaA = new LineaProduccion();
    lineaA.nombre = 'Linea A';
    lineaA.numeroBalanza = 1;
    lineaA.hardwareId = 'hw-aaaa';

    lineaB = new LineaProduccion();
    lineaB.nombre = 'Linea B';
    lineaB.numeroBalanza = 2;

    lineaInactiva = new LineaProduccion();
    lineaInactiva.nombre = 'Linea Inactiva';
    lineaInactiva.numeroBalanza = 3;
    lineaInactiva.hardwareId = 'hw-inactiva';
    lineaInactiva.activo = false;

    await em.persist([lineaA, lineaB, lineaInactiva]).flush();
  });

  describe('findLineaByHardwareId', () => {
    it('returns the active línea matching the hardwareId', async () => {
      const result = await findLineaByHardwareId(em, 'hw-aaaa');
      expect(result).not.toBeNull();
      expect(result!.id).toBe(lineaA.id);
    });

    it('returns null when no línea matches the hardwareId', async () => {
      const result = await findLineaByHardwareId(em, 'hw-does-not-exist');
      expect(result).toBeNull();
    });

    it('returns null when the matching línea is inactive (activo: false)', async () => {
      const result = await findLineaByHardwareId(em, 'hw-inactiva');
      expect(result).toBeNull();
    });
  });

  describe('assignHardwareIdToLinea', () => {
    it('assigns the hardwareId to a línea with no prior holder', async () => {
      const result = await assignHardwareIdToLinea(em, lineaB.id, 'hw-new-device');
      expect(result).not.toBeNull();
      expect(result!.hardwareId).toBe('hw-new-device');

      em.clear();
      const reloaded = await em.findOne(LineaProduccion, { id: lineaB.id });
      expect(reloaded!.hardwareId).toBe('hw-new-device');
    });

    it('atomically reassigns the hardwareId from línea A to línea B', async () => {
      const result = await assignHardwareIdToLinea(em, lineaB.id, 'hw-aaaa');
      expect(result).not.toBeNull();
      expect(result!.id).toBe(lineaB.id);
      expect(result!.hardwareId).toBe('hw-aaaa');

      em.clear();
      const reloadedA = await em.findOne(LineaProduccion, { id: lineaA.id });
      const reloadedB = await em.findOne(LineaProduccion, { id: lineaB.id });
      expect(reloadedA!.hardwareId).toBeNull();
      expect(reloadedB!.hardwareId).toBe('hw-aaaa');
    });

    it('returns null when the target lineaId does not exist', async () => {
      const result = await assignHardwareIdToLinea(em, 999999, 'hw-orphan');
      expect(result).toBeNull();
    });

    it('is idempotent when reassigning a hardwareId to its own current línea', async () => {
      const result = await assignHardwareIdToLinea(em, lineaA.id, 'hw-aaaa');
      expect(result).not.toBeNull();
      expect(result!.id).toBe(lineaA.id);
      expect(result!.hardwareId).toBe('hw-aaaa');

      em.clear();
      const reloaded = await em.findOne(LineaProduccion, { id: lineaA.id });
      expect(reloaded!.hardwareId).toBe('hw-aaaa');
    });
  });
});
