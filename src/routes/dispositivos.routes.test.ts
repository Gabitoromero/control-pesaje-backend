/**
 * Integration tests for /api/dispositivos routes.
 *
 * Unlike lineas-produccion.routes.test.ts (which mocks RequestContext.getEntityManager),
 * this file boots a REAL MikroORM instance against the test DB (same pattern as
 * app.test.ts and device-pairing.service.test.ts) so that DELETE /dispositivos/:id
 * can be verified as a genuine hard delete against the database, not just a
 * mocked call. This is required to close the "Authorization enforced" spec
 * scenario (sdd/dispositivo-registry) at the real Express route + middleware
 * chain level, not just via unit tests with auth bypassed.
 */
import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { MikroORM, SchemaGenerator } from '@mikro-orm/postgresql';
import type { EntityManager } from '@mikro-orm/core';
import jwt from 'jsonwebtoken';
import config from '../../mikro-orm.config.js';
import { initApp } from '../app.js';
import { UsuarioRol } from '../models/Usuario.js';
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

const JWT_SECRET = 'test-secret-key-dispositivos-route';

const makeToken = (rol: UsuarioRol, id = 1) =>
  jwt.sign({ id, nombreUsuario: 'testuser', rol }, JWT_SECRET);

const adminToken = () => makeToken(UsuarioRol.ADMINISTRADOR);
const jefeToken = () => makeToken(UsuarioRol.JEFE);
const operarioToken = () => makeToken(UsuarioRol.OPERARIO);

describe('DELETE /api/dispositivos/:id', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let app: Express;

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;

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

    app = await initApp(orm as never);
  });

  afterAll(async () => {
    if (orm) {
      await orm.close();
    }
  });

  beforeEach(async () => {
    em = orm.em.fork();
    await em.nativeDelete(Dispositivo, {});
  });

  const createDispositivo = async (hardwareId: string): Promise<string> => {
    const dispositivo = em.create(Dispositivo, { hardwareId, lineaProduccion: undefined, nombre: `Pi-${hardwareId.substring(0, 4)}` });
    await em.persist(dispositivo).flush();
    return dispositivo.hardwareId;
  };

  it('allows Administrador to hard-delete a Dispositivo (200/204)', async () => {
    const id = await createDispositivo('hw-admin-delete');

    const res = await request(app)
      .delete(`/api/dispositivos/${id}`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect([200, 204]).toContain(res.status);

    em.clear();
    const found = await em.findOne(Dispositivo, { hardwareId: id });
    expect(found).toBeNull();
  });

  it('allows Jefe to hard-delete a Dispositivo (200/204)', async () => {
    const id = await createDispositivo('hw-jefe-delete');

    const res = await request(app)
      .delete(`/api/dispositivos/${id}`)
      .set('Authorization', `Bearer ${jefeToken()}`);

    expect([200, 204]).toContain(res.status);

    em.clear();
    const found = await em.findOne(Dispositivo, { hardwareId: id });
    expect(found).toBeNull();
  });

  it('rejects Operario with 403 and does NOT delete the row', async () => {
    const id = await createDispositivo('hw-operario-delete');

    const res = await request(app)
      .delete(`/api/dispositivos/${id}`)
      .set('Authorization', `Bearer ${operarioToken()}`);

    expect(res.status).toBe(403);

    em.clear();
    const found = await em.findOne(Dispositivo, { hardwareId: id });
    expect(found).not.toBeNull();
  });

  it('rejects a request with no token with 401/403 and does NOT delete the row', async () => {
    const id = await createDispositivo('hw-no-token-delete');

    const res = await request(app).delete(`/api/dispositivos/${id}`);

    expect([401, 403]).toContain(res.status);

    em.clear();
    const found = await em.findOne(Dispositivo, { hardwareId: id });
    expect(found).not.toBeNull();
  });
});
