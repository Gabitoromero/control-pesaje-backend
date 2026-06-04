import 'reflect-metadata';
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { MikroORM, SchemaGenerator, RequestContext } from '@mikro-orm/postgresql';
import config from '../../mikro-orm.config.js';
import {
  Usuario,
  LineaProduccion,
  Articulo,
  Etapa,
  RutaPasada,
  RutaPasadaEtapa,
  Pasada,
  Muestra,
  UsuarioRol,
  PasadaEstado,
  MuestraEstadoValidacion
} from '../models/index.js';
import { sesionService } from './sesion.service.js';
import { PasadaService } from './pasada.service.js';
import { MuestraService } from './muestra.service.js';

describe('PasadaService and MuestraService Integration Tests', () => {
  let orm: MikroORM;
  let pasadaService: PasadaService;
  let muestraService: MuestraService;

  let testUser: Usuario;
  let testLine: LineaProduccion;
  let testArticle: Articulo;
  let testEtapa1: Etapa;
  let testEtapa2: Etapa;
  let testRutaPasada: RutaPasada;
  let testRuta1: RutaPasadaEtapa;
  let testRuta2: RutaPasadaEtapa;

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

    pasadaService = new PasadaService();
    muestraService = new MuestraService();
  });

  afterAll(async () => {
    if (orm) {
      await orm.close();
    }
  });

  beforeEach(async () => {
    // Clear in-memory sessions
    sesionService.limpiar();

    // Clear and reseed database (order respects FK constraints)
    const em = orm.em.fork();
    await em.nativeDelete(Muestra, {});
    await em.nativeDelete(Pasada, {});
    await em.nativeDelete(RutaPasadaEtapa, {});
    await em.nativeDelete(Etapa, {});
    await em.nativeDelete(Articulo, {});
    await em.nativeDelete(LineaProduccion, {});
    await em.nativeDelete(RutaPasada, {});
    await em.nativeDelete(Usuario, {});

    // Seed User
    testUser = new Usuario();
    testUser.nombreApellido = 'Juan Pérez';
    testUser.nombreUsuario = 'juan.perez';
    testUser.contrasenaHash = 'hash';
    testUser.rol = UsuarioRol.OPERARIO;
    await em.persist(testUser).flush();

    // Seed RutaPasada
    testRutaPasada = new RutaPasada();
    testRutaPasada.nombre = 'Ruta Alfajor Standard';
    await em.persist(testRutaPasada).flush();

    // Seed Line with active route
    testLine = new LineaProduccion();
    testLine.nombre = 'Linea de Envasado 1';
    testLine.numeroBalanza = 1;
    testLine.rutaPasadaActiva = testRutaPasada;
    await em.persist(testLine).flush();

    // Seed Article
    testArticle = new Articulo();
    testArticle.nombre = 'Alfajor Triple';
    testArticle.descripcion = 'Alfajor relleno con dulce de leche';
    await em.persist(testArticle).flush();

    // Seed Stages
    testEtapa1 = new Etapa();
    testEtapa1.nombre = 'Etapa Relleno';
    testEtapa1.descripcion = 'Relleno de dulce de leche';

    testEtapa2 = new Etapa();
    testEtapa2.nombre = 'Etapa Cobertura';
    testEtapa2.descripcion = 'Baño de chocolate chocolate';
    await em.persist([testEtapa1, testEtapa2]).flush();

    // Seed Stage limits for the route
    testRuta1 = new RutaPasadaEtapa();
    testRuta1.rutaPasada = testRutaPasada;
    testRuta1.etapa = testEtapa1;
    testRuta1.orden = 1;
    testRuta1.pesoIdeal = 50.000;
    testRuta1.pesoMinimo = 45.000;
    testRuta1.pesoMaximo = 55.000;
    testRuta1.cantidadMuestrasRequeridas = 2;

    testRuta2 = new RutaPasadaEtapa();
    testRuta2.rutaPasada = testRutaPasada;
    testRuta2.etapa = testEtapa2;
    testRuta2.orden = 2;
    testRuta2.pesoIdeal = 70.000;
    testRuta2.pesoMinimo = 65.000;
    testRuta2.pesoMaximo = 75.000;
    testRuta2.cantidadMuestrasRequeridas = 1;

    await em.persist([testRuta1, testRuta2]).flush();
  });

  const runInContext = <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      RequestContext.create(orm.em.fork(), () => {
        fn().then(resolve).catch(reject);
      });
    });
  };

  describe('PasadaService.iniciarPasada', () => {
    it('should fail if there is no active session on the line', () => runInContext(async () => {
      await expect(
        pasadaService.iniciarPasada(testLine.id, testArticle.id, testUser.id)
      ).rejects.toThrow(`No active session on production line ${testLine.id}`);
    }));

    it('should successfully initiate a Pasada and assign sequential numbers per line-article', () => runInContext(async () => {
      // 1. Establish session in memory
      sesionService.iniciarSesion(testLine.id, testUser.id, testUser.id, UsuarioRol.OPERARIO);

      // 2. Start first Pasada
      const pasada1 = await pasadaService.iniciarPasada(testLine.id, testArticle.id, testUser.id);
      expect(pasada1.numero).toBe(1);
      expect(pasada1.estado).toBe(PasadaEstado.EN_CURSO);
      expect(pasada1.lineaProduccion.id).toBe(testLine.id);
      expect(pasada1.articulo!.id).toBe(testArticle.id);

      // Verify session in memory matches the created pasada
      const activeSession = sesionService.obtenerSesion(testLine.id);
      expect(activeSession!.pasadaId).toBe(pasada1.id);

      // End first pasada to start a second one
      await pasadaService.completarPasada(pasada1.id);

      // Reset the session's pasadaId (simulating opening tablet again or starting new run)
      activeSession!.pasadaId = null;

      // 3. Start second Pasada
      const pasada2 = await pasadaService.iniciarPasada(testLine.id, testArticle.id, testUser.id);
      expect(pasada2.numero).toBe(2);
      expect(pasada2.estado).toBe(PasadaEstado.EN_CURSO);
    }));
  });

  describe('MuestraService.registrarMuestra', () => {
    it('should validate sample range correctly', () => runInContext(async () => {
      sesionService.iniciarSesion(testLine.id, testUser.id, testUser.id, UsuarioRol.OPERARIO);
      const pasada = await pasadaService.iniciarPasada(testLine.id, testArticle.id, testUser.id);

      // OK sample
      const m1 = await muestraService.registrarMuestra(
        testUser.id,
        testArticle.id,
        testEtapa1.id,
        testLine.id,
        48.500, // inside [45, 55]
        pasada.id
      );
      expect(m1.estadoValidacion).toBe(MuestraEstadoValidacion.OK);
      expect(Number(m1.pesoNeto)).toBe(48.500);

      // Out of range (low) sample
      const m2 = await muestraService.registrarMuestra(
        testUser.id,
        testArticle.id,
        testEtapa1.id,
        testLine.id,
        42.000, // below 45
        pasada.id
      );
      expect(m2.estadoValidacion).toBe(MuestraEstadoValidacion.FUERA_DE_RANGO);

      // Out of range (high) sample
      const m3 = await muestraService.registrarMuestra(
        testUser.id,
        testArticle.id,
        testEtapa1.id,
        testLine.id,
        58.000, // above 55
        pasada.id
      );
      expect(m3.estadoValidacion).toBe(MuestraEstadoValidacion.FUERA_DE_RANGO);
    }));

    it('should reject registration of subsequent stages if preceding stages are incomplete', () => runInContext(async () => {
      sesionService.iniciarSesion(testLine.id, testUser.id, testUser.id, UsuarioRol.OPERARIO);
      const pasada = await pasadaService.iniciarPasada(testLine.id, testArticle.id, testUser.id);

      // Attempt to register Etapa 2 directly (Etapa 1 needs 2 OK samples, currently has 0)
      await expect(
        muestraService.registrarMuestra(
          testUser.id,
          testArticle.id,
          testEtapa2.id,
          testLine.id,
          70.000,
          pasada.id
        )
      ).rejects.toThrow(`Preceding stage '${testEtapa1.id}' is not complete`);
    }));

    it('should progress through stages and complete the Pasada on the last sample', () => runInContext(async () => {
      sesionService.iniciarSesion(testLine.id, testUser.id, testUser.id, UsuarioRol.OPERARIO);
      const pasada = await pasadaService.iniciarPasada(testLine.id, testArticle.id, testUser.id);

      // Register 1st OK sample for Etapa 1
      await muestraService.registrarMuestra(
        testUser.id,
        testArticle.id,
        testEtapa1.id,
        testLine.id,
        50.000,
        pasada.id
      );

      // Register an out-of-range sample for Etapa 1
      await muestraService.registrarMuestra(
        testUser.id,
        testArticle.id,
        testEtapa1.id,
        testLine.id,
        60.000, // fuera de rango
        pasada.id
      );

      // Preceding stage check should still see Etapa 1 as incomplete (progress: 1/2)
      await expect(
        muestraService.registrarMuestra(
          testUser.id,
          testArticle.id,
          testEtapa2.id,
          testLine.id,
          70.000,
          pasada.id
        )
      ).rejects.toThrow(`Preceding stage '${testEtapa1.id}' is not complete`);

      // Register 2nd OK sample for Etapa 1 -> Etapa 1 is complete!
      await muestraService.registrarMuestra(
        testUser.id,
        testArticle.id,
        testEtapa1.id,
        testLine.id,
        52.000,
        pasada.id
      );

      // Now Etapa 2 sample should be accepted
      const mEtapa2 = await muestraService.registrarMuestra(
        testUser.id,
        testArticle.id,
        testEtapa2.id,
        testLine.id,
        72.000, // OK sample for Etapa 2 [65, 75]
        pasada.id
      );
      expect(mEtapa2.estadoValidacion).toBe(MuestraEstadoValidacion.OK);

      // Since Etapa 2 is the last stage and requires 1 sample, the entire Pasada must transition to complete
      const em = orm.em.fork();
      const updatedPasada = await em.findOneOrFail(Pasada, pasada.id);
      expect(updatedPasada.estado).toBe(PasadaEstado.COMPLETA);
      expect(updatedPasada.horaCierre).toBeInstanceOf(Date);

      // The in-memory session should clear the active pasadaId
      const session = sesionService.obtenerSesion(testLine.id);
      expect(session!.pasadaId).toBeNull();
    }));

    it('should throw when registering a random sample on a line without rutaPasadaActiva', () => runInContext(async () => {
      const em = orm.em.fork();
      const lineaSinRuta = new LineaProduccion();
      lineaSinRuta.nombre = 'Linea Sin Ruta Activa';
      lineaSinRuta.numeroBalanza = 99;
      await em.persist(lineaSinRuta).flush();

      sesionService.iniciarSesion(lineaSinRuta.id, testUser.id, testUser.id, UsuarioRol.OPERARIO);

      await expect(
        muestraService.registrarMuestra(
          testUser.id,
          undefined,
          testEtapa1.id,
          lineaSinRuta.id,
          50.000
        )
      ).rejects.toThrow('No se pueden registrar muestras al azar en una línea de producción sin ruta de pasada activa (modo puesta a punto)');
    }));

    it('should register a random sample successfully when line has active rutaPasada', () => runInContext(async () => {
      sesionService.iniciarSesion(testLine.id, testUser.id, testUser.id, UsuarioRol.OPERARIO);

      const m = await muestraService.registrarMuestra(
        testUser.id,
        undefined, // no articuloId for random quality sample
        testEtapa1.id,
        testLine.id,
        50.000 // inside [45, 55], no pasadaId
      );

      expect(m.estadoValidacion).toBe(MuestraEstadoValidacion.OK);
      expect(m.articulo).toBeUndefined();
      expect(m.rutaPasada.id).toBe(testRutaPasada.id);
    }));
  });

  describe('Deletes and Updates Restrictions on Completed Records', () => {
    it('should reject updates and soft-deletes of completed Pasadas and Muestras', () => runInContext(async () => {
      sesionService.iniciarSesion(testLine.id, testUser.id, testUser.id, UsuarioRol.OPERARIO);
      const pasada = await pasadaService.iniciarPasada(testLine.id, testArticle.id, testUser.id);

      // Create samples to complete the pasada
      const m1 = await muestraService.registrarMuestra(testUser.id, testArticle.id, testEtapa1.id, testLine.id, 50.000, pasada.id);
      await muestraService.registrarMuestra(testUser.id, testArticle.id, testEtapa1.id, testLine.id, 50.000, pasada.id);
      await muestraService.registrarMuestra(testUser.id, testArticle.id, testEtapa2.id, testLine.id, 70.000, pasada.id);

      // The pasada is now completed
      const em = orm.em.fork();
      const completedPasada = await em.findOneOrFail(Pasada, pasada.id);
      expect(completedPasada.estado).toBe(PasadaEstado.COMPLETA);

      // 1. Block Pasada updates/deletes
      await expect(
        pasadaService.update(pasada.id, { numero: 99 })
      ).rejects.toThrow('Cannot update a completed or aborted pasada');

      await expect(
        pasadaService.softDelete(pasada.id)
      ).rejects.toThrow('Cannot delete a completed or aborted pasada');

      // 2. Block Muestra updates/deletes for completed Pasada
      await expect(
        muestraService.update(m1.id, { pesoNeto: 99.0 })
      ).rejects.toThrow('Cannot update sample of a completed or aborted pasada');

      await expect(
        muestraService.softDelete(m1.id)
      ).rejects.toThrow('Cannot delete sample of a completed or aborted pasada');
    }));

    it('should successfully abort a pasada and reject subsequent operations', () => runInContext(async () => {
      sesionService.iniciarSesion(testLine.id, testUser.id, testUser.id, UsuarioRol.OPERARIO);
      const pasada = await pasadaService.iniciarPasada(testLine.id, testArticle.id, testUser.id);
      expect(pasada.estado).toBe(PasadaEstado.EN_CURSO);

      // Abort the pasada
      const abortedPasada = await pasadaService.abortarPasada(pasada.id, 'Se rompió la balanza en la línea productiva');
      expect(abortedPasada!.estado).toBe(PasadaEstado.ABORTADA);
      expect(abortedPasada!.motivoCierre).toBe('Se rompió la balanza en la línea productiva');
      expect(abortedPasada!.horaCierre).toBeInstanceOf(Date);

      // The in-memory session active pasadaId should be cleared
      const session = sesionService.obtenerSesion(testLine.id);
      expect(session!.pasadaId).toBeNull();

      // Block registering new samples on aborted pasada
      await expect(
        muestraService.registrarMuestra(testUser.id, testArticle.id, testEtapa1.id, testLine.id, 50.000, pasada.id)
      ).rejects.toThrow('Cannot register sample: Pasada is already completed or aborted');

      // Block updates/deletions on aborted pasada
      await expect(
        pasadaService.update(pasada.id, { numero: 12 })
      ).rejects.toThrow('Cannot update a completed or aborted pasada');

      await expect(
        pasadaService.softDelete(pasada.id)
      ).rejects.toThrow('Cannot delete a completed or aborted pasada');
    }));
  });
});
