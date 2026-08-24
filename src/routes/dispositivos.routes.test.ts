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
  Balanza,
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
        Balanza,
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

describe('PATCH /api/dispositivos/:id/unidad', () => {
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
        Balanza,
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

  const createDispositivo = async (hardwareId: string, unidad: 'g' | 'kg' = 'kg'): Promise<string> => {
    const dispositivo = em.create(Dispositivo, {
      hardwareId,
      lineaProduccion: undefined,
      nombre: `Pi-${hardwareId.substring(0, 4)}`,
      unidad,
    });
    await em.persist(dispositivo).flush();
    return dispositivo.hardwareId;
  };

  it('allows Administrador to correct unidad, returns 200 and persists the new value', async () => {
    const id = await createDispositivo('hw-patch-admin', 'kg');

    const res = await request(app)
      .patch(`/api/dispositivos/${id}/unidad`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ unidad: 'g' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.unidad).toBe('g');

    em.clear();
    const found = await em.findOne(Dispositivo, { hardwareId: id });
    expect(found?.unidad).toBe('g');
  });

  it('allows Jefe to correct unidad', async () => {
    const id = await createDispositivo('hw-patch-jefe', 'kg');

    const res = await request(app)
      .patch(`/api/dispositivos/${id}/unidad`)
      .set('Authorization', `Bearer ${jefeToken()}`)
      .send({ unidad: 'g' });

    expect(res.status).toBe(200);

    em.clear();
    const found = await em.findOne(Dispositivo, { hardwareId: id });
    expect(found?.unidad).toBe('g');
  });

  it('allows Operario to correct unidad (tablet operator, confirmed product decision)', async () => {
    const id = await createDispositivo('hw-patch-operario', 'kg');

    const res = await request(app)
      .patch(`/api/dispositivos/${id}/unidad`)
      .set('Authorization', `Bearer ${operarioToken()}`)
      .send({ unidad: 'g' });

    expect(res.status).toBe(200);

    em.clear();
    const found = await em.findOne(Dispositivo, { hardwareId: id });
    expect(found?.unidad).toBe('g');
  });

  it('rejects an invalid unidad value with 400 and does NOT change the stored value', async () => {
    const id = await createDispositivo('hw-patch-invalid', 'kg');

    const res = await request(app)
      .patch(`/api/dispositivos/${id}/unidad`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ unidad: 'lb' });

    expect(res.status).toBe(400);

    em.clear();
    const found = await em.findOne(Dispositivo, { hardwareId: id });
    expect(found?.unidad).toBe('kg');
  });

  it('returns 404 for an unknown hardwareId', async () => {
    const res = await request(app)
      .patch('/api/dispositivos/hw-does-not-exist/unidad')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ unidad: 'g' });

    expect(res.status).toBe(404);
  });

  it('rejects a role outside [ADMINISTRADOR, JEFE, OPERARIO] with 403', async () => {
    const id = await createDispositivo('hw-patch-forbidden-role', 'kg');
    const otherRoleToken = jwt.sign(
      { id: 99, nombreUsuario: 'nope', rol: 'INVITADO' },
      JWT_SECRET,
    );

    const res = await request(app)
      .patch(`/api/dispositivos/${id}/unidad`)
      .set('Authorization', `Bearer ${otherRoleToken}`)
      .send({ unidad: 'g' });

    expect(res.status).toBe(403);

    em.clear();
    const found = await em.findOne(Dispositivo, { hardwareId: id });
    expect(found?.unidad).toBe('kg');
  });

  it('rejects an unauthenticated request with 401', async () => {
    const id = await createDispositivo('hw-patch-unauth', 'kg');

    const res = await request(app)
      .patch(`/api/dispositivos/${id}/unidad`)
      .send({ unidad: 'g' });

    expect([401, 403]).toContain(res.status);

    em.clear();
    const found = await em.findOne(Dispositivo, { hardwareId: id });
    expect(found?.unidad).toBe('kg');
  });

  it('still returns 200 when the device has no línea assigned (emit guard never triggers)', async () => {
    const id = await createDispositivo('hw-patch-no-socket', 'kg');

    const res = await request(app)
      .patch(`/api/dispositivos/${id}/unidad`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ unidad: 'g' });

    expect(res.status).toBe(200);

    em.clear();
    const found = await em.findOne(Dispositivo, { hardwareId: id });
    expect(found?.unidad).toBe('g');
  });

  it('still returns 200 and persists when the device HAS a línea assigned and getIo() throws (no Socket.io server initialized in this test app) — proves the try/catch around the emit actually protects the response', async () => {
    const balanza = em.create(Balanza, { nombre: 'Balanza-patch-emit-test', activo: true });
    const articulo = em.create(Articulo, {
      codigo: 'ART-PATCH-EMIT',
      nombre: 'Articulo patch emit test',
      activo: true,
    });
    const linea = em.create(LineaProduccion, {
      nombre: 'Linea-patch-emit-test',
      balanza,
      articulo,
      activo: true,
    });
    const dispositivo = em.create(Dispositivo, {
      hardwareId: 'hw-patch-with-linea',
      nombre: 'Pi-patch-with-linea',
      unidad: 'kg',
      lineaProduccion: linea,
    });
    await em.persist([balanza, articulo, linea, dispositivo]).flush();
    em.clear();

    const res = await request(app)
      .patch('/api/dispositivos/hw-patch-with-linea/unidad')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ unidad: 'g' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    em.clear();
    const found = await em.findOne(Dispositivo, { hardwareId: 'hw-patch-with-linea' });
    expect(found?.unidad).toBe('g');
  });
});
