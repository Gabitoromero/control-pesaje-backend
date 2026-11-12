import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, SchemaGenerator } from '@mikro-orm/postgresql';
import config from '../../mikro-orm.config.js';
import {
  Usuario, LineaProduccion, Articulo, Etapa, RutaPasada, ArticuloRutaPasada, RutaPasadaEtapa,
  Pasada, Muestra, Balanza, HistorialCambio,
} from '../models/index.js';
import { UsuarioRol } from '../shared/types.js';
import { clearDatabase } from '../test-utils/db-teardown.js';
import { AuditSubscriber } from './audit.subscriber.js';
import { runWithAuditUser } from './audit-context.js';

describe('audit trail (real Postgres)', () => {
  let orm: MikroORM;
  let userId: number;

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...config,
      dbName: 'control_pesaje_tests',
      extensions: [SchemaGenerator],
      entities: [Usuario, LineaProduccion, Articulo, Etapa, RutaPasada, ArticuloRutaPasada, RutaPasadaEtapa, Pasada, Muestra, Balanza, HistorialCambio],
      entitiesTs: [],
      allowGlobalContext: true,
    });
    orm.em.getEventManager().registerSubscriber(new AuditSubscriber());
    await orm.schema.ensureDatabase();
    await orm.schema.drop();
    await orm.schema.create();
  });

  afterAll(async () => {
    if (orm) await orm.close();
  });

  beforeEach(async () => {
    await clearDatabase(orm);
    const em = orm.em.fork();
    const u = em.create(Usuario, {
      nombreApellido: 'Ana Test', nombreUsuario: 'ana', legajo: '00001', pinHash: 'x', rol: UsuarioRol.JEFE, activo: true, esSistema: false, puedeTomarMuestrasLibres: false,
    });
    await em.flush();
    userId = u.id;
  });

  const rows = async (raizTipo: string, raizId: number) =>
    orm.em.fork().find(HistorialCambio, { raizTipo, raizId }, { orderBy: { id: 'ASC' } });

  it('records create, edit, deactivate and delete of an Articulo with the session user', async () => {
    await runWithAuditUser(userId, async () => {
      const em = orm.em.fork();
      const a = em.create(Articulo, { codigo: 'A1', nombre: 'Uno', activo: true });
      await em.flush();
      a.nombre = 'Dos';
      await em.flush();
      a.activo = false;
      await em.flush();
      em.remove(a);
      await em.flush();

      const log = await rows('articulo', a.id);
      expect(log.map((r) => r.accion)).toEqual(['crear', 'editar', 'desactivar', 'eliminar']);
      expect(log[1].antes).toEqual({ nombre: 'Uno' });
      expect(log[1].despues).toEqual({ nombre: 'Dos' });
      expect(log[3].antes).toMatchObject({ codigo: 'A1', nombre: 'Dos' });
      expect(log.every((r) => r.entidadId === a.id)).toBe(true);
    });
    const all = await orm.em.fork().find(HistorialCambio, {}, { populate: ['usuario'] });
    expect(all.every((r) => r.usuario?.id === userId)).toBe(true);
  });

  it('rolls the audit row back together with the change inside a transaction', async () => {
    await runWithAuditUser(userId, async () => {
      const em = orm.em.fork();
      await expect(
        em.transactional(async (tx) => {
          tx.create(Etapa, { nombre: 'E-rollback', activo: true });
          await tx.flush();
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
    });
    expect(await orm.em.fork().count(HistorialCambio)).toBe(0);
  });

  it('audits nested etapa tolerancia and assigned articulos under the ruta root', async () => {
    await runWithAuditUser(userId, async () => {
      const em = orm.em.fork();
      const etapa = em.create(Etapa, { nombre: 'Corte', activo: true });
      const art = em.create(Articulo, { codigo: 'R1', nombre: 'R', activo: true });
      const ruta = em.create(RutaPasada, { nombre: 'Ruta 1', activo: true });
      await em.flush();
      const re = em.create(RutaPasadaEtapa, {
        rutaPasada: ruta, etapa, orden: 1, pesoIdeal: 10, pesoMinimo: 9, pesoMaximo: 11, cantidadMuestrasRequeridas: 1,
      } as never);
      const link = em.create(ArticuloRutaPasada, { articulo: art, rutaPasada: ruta });
      await em.flush();
      re.toleranciaPct = 7 as never;
      await em.flush();
      em.remove(link);
      await em.flush();

      const log = await rows('ruta', ruta.id);
      const byEntidad = log.map((r) => `${r.entidad}:${r.accion}`);
      expect(byEntidad).toContain('ruta:crear');
      expect(byEntidad).toContain('ruta_etapa:crear');
      expect(byEntidad).toContain('ruta_articulo:crear');
      expect(byEntidad).toContain('ruta_etapa:editar');
      expect(byEntidad).toContain('ruta_articulo:eliminar');
      const tol = log.find((r) => r.entidad === 'ruta_etapa' && r.accion === 'editar')!;
      expect(tol.despues).toEqual({ toleranciaPct: 7 });
    });
  });
});
