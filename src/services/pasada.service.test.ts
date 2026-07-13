import 'reflect-metadata';
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { MikroORM, SchemaGenerator, RequestContext } from '@mikro-orm/postgresql';
import config from '../../mikro-orm.config.js';
import {
  Usuario, LineaProduccion, Articulo, Etapa, RutaPasada,
  RutaPasadaEtapa, Pasada, Muestra, UsuarioRol, PasadaEstado, ArticuloRutaPasada
} from '../models/index.js';
import { sesionService } from './sesion.service.js';
import { PasadaService } from './pasada.service.js';
import { clearDatabase } from '../test-utils/db-teardown.js';

describe('PasadaService Tests', () => {
  let orm: MikroORM;
  let pasadaService: PasadaService;

  let testUser: Usuario;
  let testLine: LineaProduccion;
  let testArticle: Articulo;
  let testRutaPasada: RutaPasada;

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...config,
      dbName: 'control_pesaje_test',
      extensions: [SchemaGenerator],
      entities: [Usuario, LineaProduccion, Articulo, Etapa, RutaPasada, RutaPasadaEtapa, Pasada, Muestra, ArticuloRutaPasada],
      entitiesTs: [],
      allowGlobalContext: true,
    });

    const generator = orm.schema;
    await generator.ensureDatabase();
    await generator.drop();
    await generator.create();

    pasadaService = new PasadaService();
  });

  afterAll(async () => {
    if (orm) await orm.close();
  });

  beforeEach(async () => {
    sesionService.limpiar();
    await clearDatabase(orm);
    const em = orm.em.fork();

    testUser = new Usuario();
    testUser.nombreApellido = 'Juan Pérez';
    testUser.nombreUsuario = 'juan.perez';
    testUser.legajo = 'LEG-001';
    testUser.pinHash = 'hash';
    testUser.rol = UsuarioRol.OPERARIO;
    testUser.puedeTomarMuestrasLibres = true;
    await em.persist(testUser).flush();

    testRutaPasada = new RutaPasada();
    testRutaPasada.nombre = 'Ruta Alfajor Standard';
    await em.persist(testRutaPasada).flush();

    testLine = new LineaProduccion();
    testLine.nombre = 'Linea de Envasado 1';
    testLine.activo = true;
    testLine.rutaPasadaActiva = testRutaPasada;
    await em.persist(testLine).flush();

    testArticle = new Articulo();
    testArticle.nombre = 'Alfajor Triple';
    testArticle.descripcion = 'Alfajor relleno con dulce de leche';
    await em.persist(testArticle).flush();

    const testArticuloRuta = new ArticuloRutaPasada();
    testArticuloRuta.articulo = testArticle;
    testArticuloRuta.rutaPasada = testRutaPasada;
    await em.persist(testArticuloRuta).flush();
  });

  const runInContext = <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      RequestContext.create(orm.em.fork(), () => {
        fn().then(resolve).catch(reject);
      });
    });
  };

  describe('iniciarPasada', () => {
    it('should fail if there is no active session on the line', () => runInContext(async () => {
      await expect(
        pasadaService.iniciarPasada(testLine.id, testArticle.id, testUser.id)
      ).rejects.toThrow(`No active session on production line ${testLine.id}`);
    }));

    it('should fail if the article does not belong to the active route of the line', () => runInContext(async () => {
      const em = orm.em.fork();
      const offRouteArticle = new Articulo();
      offRouteArticle.nombre = 'Alfajor Blanco';
      offRouteArticle.descripcion = 'Sin ruta asignada';
      await em.persist(offRouteArticle).flush();

      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.OPERARIO);

      await expect(
        pasadaService.iniciarPasada(testLine.id, offRouteArticle.id, testUser.id)
      ).rejects.toThrow(`Article ${offRouteArticle.id} does not belong to the active route of production line ${testLine.id}`);
    }));

    it('should successfully initiate a Pasada and assign sequential numbers per line-article', () => runInContext(async () => {
      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.OPERARIO);
      const pasada1 = await pasadaService.iniciarPasada(testLine.id, testArticle.id, testUser.id);
      expect(pasada1.numero).toBe(1);
      expect(pasada1.estado).toBe(PasadaEstado.EN_CURSO);
      expect(pasada1.lineaProduccion.id).toBe(testLine.id);
      expect(pasada1.articulo!.id).toBe(testArticle.id);

      const activeSession = sesionService.obtenerSesion(testLine.id);
      expect(activeSession!.pasadaId).toBe(pasada1.id);

      await pasadaService.completarPasada(pasada1.id);
      activeSession!.pasadaId = null;

      const pasada2 = await pasadaService.iniciarPasada(testLine.id, testArticle.id, testUser.id);
      expect(pasada2.numero).toBe(2);
      expect(pasada2.estado).toBe(PasadaEstado.EN_CURSO);
    }));
  });

  describe('Restrictions on Completed Records (Pasada Only)', () => {
    it('should reject updates and soft-deletes of completed Pasadas', () => runInContext(async () => {
      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.OPERARIO);
      const pasada = await pasadaService.iniciarPasada(testLine.id, testArticle.id, testUser.id);
      
      await pasadaService.completarPasada(pasada.id);
      
      await expect(pasadaService.update(pasada.id, { numero: 99 }))
        .rejects.toThrow('Cannot update a completed or aborted pasada');
      await expect(pasadaService.softDelete(pasada.id))
        .rejects.toThrow('Cannot delete a completed or aborted pasada');
    }));

    it('should successfully abort a pasada and reject subsequent operations', () => runInContext(async () => {
      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.OPERARIO);
      const pasada = await pasadaService.iniciarPasada(testLine.id, testArticle.id, testUser.id);
      
      const abortedPasada = await pasadaService.abortarPasada(pasada.id, 'Motivo de prueba');
      expect(abortedPasada!.estado).toBe(PasadaEstado.ABORTADA);
      
      const session = sesionService.obtenerSesion(testLine.id);
      expect(session!.pasadaId).toBeNull();
      
      await expect(pasadaService.update(pasada.id, { numero: 12 }))
        .rejects.toThrow('Cannot update a completed or aborted pasada');
      await expect(pasadaService.softDelete(pasada.id))
        .rejects.toThrow('Cannot delete a completed or aborted pasada');
    }));
  });
});
