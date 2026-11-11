import 'reflect-metadata';
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { MikroORM, SchemaGenerator, RequestContext } from '@mikro-orm/postgresql';
import config from '../../mikro-orm.config.js';
import {
  Usuario, LineaProduccion, Articulo, Etapa, RutaPasada,
  RutaPasadaEtapa, Pasada, Muestra, PasadaEstado, ArticuloRutaPasada, Balanza
} from '../models/index.js';
import { sesionService } from './sesion.service.js';
import { PasadaService } from './pasada.service.js';
import { clearDatabase } from '../test-utils/db-teardown.js';
import { UsuarioRol } from '../shared/types.js';

describe('PasadaService Tests', () => {
  let orm: MikroORM;
  let pasadaService: PasadaService;

  let testUser: Usuario;
  let testLine: LineaProduccion;
  let testArticle: Articulo;
  let testBalanza: Balanza;
  let testRutaPasada: RutaPasada;

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...config,
      dbName: 'control_pesaje_tests',
      extensions: [SchemaGenerator],
      entities: [Usuario, LineaProduccion, Articulo, Etapa, RutaPasada, RutaPasadaEtapa, Pasada, Muestra, ArticuloRutaPasada, Balanza],
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
    testUser.legajo = '00001';
    testUser.pinHash = 'hash';
    testUser.rol = UsuarioRol.OPERARIO;
    testUser.puedeTomarMuestrasLibres = true;
    await em.persist(testUser).flush();

    testRutaPasada = new RutaPasada();
    testRutaPasada.nombre = 'Ruta Alfajor Standard';
    await em.persist(testRutaPasada).flush();

    // Seed Balanza
    testBalanza = new Balanza();
    testBalanza.nombre = 'Balanza Test';
    testBalanza.activo = true;
    await em.persist(testBalanza).flush();

    // Seed Article
    testArticle = new Articulo();
    testArticle.codigo = 'Alfajor Triple';
    testArticle.descripcion = 'Alfajor relleno con dulce de leche';
    await em.persist(testArticle).flush();

    // The balanza is already verified for this article (verification rule has its own describe below)
    testBalanza.ultimoArticulo = testArticle;
    testBalanza.verificacionPendiente = false;
    await em.flush();

    // Seed Line
    testLine = new LineaProduccion();
    testLine.nombre = 'Linea de Envasado 1';
    testLine.activo = true;
    testLine.rutaPasadaActiva = testRutaPasada;
    testLine.balanza = testBalanza;
    testLine.articulo = testArticle;
    await em.persist(testLine).flush();

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
        pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id)
      ).rejects.toThrow(`No hay una sesión activa en la línea de producción ${testLine.id}`);
    }));

    it('should fail if the article does not belong to the active route of the line', () => runInContext(async () => {
      const em = orm.em.fork();
      const offRouteArticle = new Articulo();
      offRouteArticle.codigo = 'Alfajor Blanco';
      offRouteArticle.descripcion = 'Sin ruta asignada';
      await em.persist(offRouteArticle).flush();

      // Set offRouteArticle on testLine
      const lineToUpdate = await em.findOne(LineaProduccion, testLine.id);
      lineToUpdate!.articulo = offRouteArticle;
      await em.persist(lineToUpdate!).flush();

      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.OPERARIO);

      await expect(
        pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id)
      ).rejects.toThrow(`El artículo ${offRouteArticle.id} no pertenece a la ruta activa de la línea de producción ${testLine.id}`);
    }));

    it('should successfully initiate a Pasada and assign sequential numbers per line-article', () => runInContext(async () => {
      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.OPERARIO);
      const pasada1 = await pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id);
      expect(pasada1.numero).toBe(1);
      expect(pasada1.estado).toBe(PasadaEstado.EN_CURSO);
      expect(pasada1.lineaProduccion.id).toBe(testLine.id);
      expect(pasada1.articulo!.id).toBe(testArticle.id);

      const activeSession = sesionService.obtenerSesion(testLine.id);
      expect(activeSession!.pasadaId).toBe(pasada1.id);

      await pasadaService.completarPasada(pasada1.id);
      activeSession!.pasadaId = null;

      const pasada2 = await pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id);
      expect(pasada2.numero).toBe(2);
      expect(pasada2.estado).toBe(PasadaEstado.EN_CURSO);
    }));

    it('should persist observacion when the 4th arg is passed', () => runInContext(async () => {
      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.OPERARIO);
      const pasada = await pasadaService.iniciarPasada(
        testLine.id,
        testBalanza.id,
        testUser.id,
        'lote nuevo de materia prima'
      );
      expect(pasada.observacion).toBe('lote nuevo de materia prima');
    }));

    it('should leave observacion as null when the 4th arg is omitted', () => runInContext(async () => {
      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.OPERARIO);
      const pasada = await pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id);
      expect(pasada.observacion).toBeNull();
    }));
  });

  describe('balanza verification', () => {
    let articuloVerif: Articulo;
    let rutaVerif: RutaPasada;
    let lineaCalibracion: LineaProduccion;

    beforeEach(async () => {
      const em = orm.em.fork();
      articuloVerif = new Articulo();
      articuloVerif.codigo = '0';
      articuloVerif.descripcion = 'Pesas patrón';
      rutaVerif = new RutaPasada();
      rutaVerif.nombre = 'Verificación con pesas patrón';
      await em.persist([articuloVerif, rutaVerif]).flush();

      const vinculo = new ArticuloRutaPasada();
      vinculo.articulo = articuloVerif;
      vinculo.rutaPasada = rutaVerif;
      await em.persist(vinculo).flush();

      lineaCalibracion = new LineaProduccion();
      lineaCalibracion.nombre = 'Línea de calibración';
      lineaCalibracion.activo = true;
      lineaCalibracion.rutaPasadaActiva = rutaVerif;
      lineaCalibracion.balanza = testBalanza;
      lineaCalibracion.articulo = articuloVerif;
      await em.persist(lineaCalibracion).flush();
    });

    const cargarBalanza = () =>
      orm.em.fork().findOneOrFail(Balanza, testBalanza.id, { populate: ['ultimoArticulo'] });

    const marcarBalanza = async (pendiente: boolean, ultimo: Articulo | null) => {
      const em = orm.em.fork();
      const b = await em.findOneOrFail(Balanza, testBalanza.id);
      b.verificacionPendiente = pendiente;
      b.ultimoArticulo = ultimo ? em.getReference(Articulo, ultimo.id) : null;
      await em.flush();
    };

    const cambiarArticuloDeLinea = async (articulo: Articulo) => {
      const em = orm.em.fork();
      const l = await em.findOneOrFail(LineaProduccion, testLine.id);
      l.articulo = em.getReference(Articulo, articulo.id);
      await em.flush();
    };

    const otroArticuloEnRuta = async () => {
      const em = orm.em.fork();
      const otro = new Articulo();
      otro.codigo = 'Alfajor Blanco';
      await em.persist(otro).flush();
      const vinculo = new ArticuloRutaPasada();
      vinculo.articulo = otro;
      vinculo.rutaPasada = testRutaPasada;
      await em.persist(vinculo).flush();
      return otro;
    };

    it('same article with the flag down starts normally and keeps the flag down', () => runInContext(async () => {
      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.OPERARIO);
      const pasada = await pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id);
      expect(pasada.estado).toBe(PasadaEstado.EN_CURSO);
      const balanza = await cargarBalanza();
      expect(balanza.verificacionPendiente).toBe(false);
      expect(balanza.ultimoArticulo!.id).toBe(testArticle.id);
    }));

    it('rejects a different article, raises the flag and persists it', () => runInContext(async () => {
      const otro = await otroArticuloEnRuta();
      await cambiarArticuloDeLinea(otro);
      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.OPERARIO);

      await expect(
        pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id)
      ).rejects.toThrow(/Balanza sin verificar: cambió el artículo/);

      const balanza = await cargarBalanza();
      expect(balanza.verificacionPendiente).toBe(true);
      expect(balanza.ultimoArticulo!.id).toBe(testArticle.id);
      expect(await orm.em.fork().count(Pasada, {})).toBe(0);
    }));

    it('rejects the first pasada of a balanza with no history', () => runInContext(async () => {
      await marcarBalanza(true, null);
      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.OPERARIO);

      await expect(
        pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id)
      ).rejects.toThrow(/Balanza sin verificar: la balanza no tiene historial/);
      expect((await cargarBalanza()).verificacionPendiente).toBe(true);
    }));

    it('with the flag on only the verification route can start, from the production line', () => runInContext(async () => {
      await marcarBalanza(true, testArticle);
      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.OPERARIO);

      await expect(
        pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id)
      ).rejects.toThrow(/Balanza sin verificar/);

      const verif = await pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id, undefined, true);
      expect(verif.articulo.id).toBe(articuloVerif.id);
      expect(verif.rutaPasada.id).toBe(rutaVerif.id);
      expect(verif.lineaProduccion.id).toBe(testLine.id);
    }));

    it('with the flag on the verification route can start from the calibration line', () => runInContext(async () => {
      await marcarBalanza(true, null);
      sesionService.iniciarSesion(lineaCalibracion.id, testUser.id, UsuarioRol.OPERARIO);

      const verif = await pasadaService.iniciarPasada(lineaCalibracion.id, testBalanza.id, testUser.id);
      expect(verif.articulo.id).toBe(articuloVerif.id);
    }));

    it('no role bypasses the block (the rule lives in the service)', () => runInContext(async () => {
      await marcarBalanza(true, testArticle);
      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.ADMINISTRADOR);
      await expect(
        pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id)
      ).rejects.toThrow(/Balanza sin verificar/);
    }));

    it('completing a verification pasada from another line lowers the flag and records the line article', () => runInContext(async () => {
      await marcarBalanza(true, null);
      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.OPERARIO);
      const verif = await pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id, undefined, true);

      // Still pending while the verification is running
      expect((await cargarBalanza()).verificacionPendiente).toBe(true);

      await pasadaService.completarPasada(verif.id);
      const balanza = await cargarBalanza();
      expect(balanza.verificacionPendiente).toBe(false);
      expect(balanza.ultimoArticulo!.id).toBe(testArticle.id);

      // Production of the article in force now starts
      sesionService.actualizarPasada(testLine.id, null);
      const normal = await pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id);
      expect(normal.articulo.id).toBe(testArticle.id);
    }));

    it('an aborted verification pasada does not lower the flag', () => runInContext(async () => {
      await marcarBalanza(true, null);
      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.OPERARIO);
      const verif = await pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id, undefined, true);

      await pasadaService.abortarPasada(verif.id, 'Pesa patrón fuera de rango');
      const balanza = await cargarBalanza();
      expect(balanza.verificacionPendiente).toBe(true);
      expect(balanza.ultimoArticulo).toBeNull();
    }));

    it('completing a production pasada does not touch the balanza flag', () => runInContext(async () => {
      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.OPERARIO);
      const pasada = await pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id);
      await pasadaService.completarPasada(pasada.id);
      expect((await cargarBalanza()).verificacionPendiente).toBe(false);
    }));

    it('picks the lowest-id verification route when several exist', () => runInContext(async () => {
      const em = orm.em.fork();
      const otraRuta = new RutaPasada();
      otraRuta.nombre = 'Otra verificación';
      await em.persist(otraRuta).flush();
      const vinculo = new ArticuloRutaPasada();
      vinculo.articulo = articuloVerif;
      vinculo.rutaPasada = otraRuta;
      await em.persist(vinculo).flush();

      await marcarBalanza(true, null);
      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.OPERARIO);
      const verif = await pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id, undefined, true);
      expect(verif.rutaPasada.id).toBe(Math.min(rutaVerif.id, otraRuta.id));
    }));

    it('fails with a clear message when no verification route exists', () => runInContext(async () => {
      const em = orm.em.fork();
      await em.nativeDelete(Pasada, {});
      await em.nativeDelete(LineaProduccion, { id: lineaCalibracion.id });
      await em.nativeDelete(ArticuloRutaPasada, { articulo: articuloVerif.id });

      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.OPERARIO);
      await expect(
        pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id, undefined, true)
      ).rejects.toThrow('No se encontró la ruta de verificación');
    }));
  });


  describe('registrarLineaParada', () => {
    it('registers a new pasada directly as parada when none is running (no session needed)', () => runInContext(async () => {
      const pasada = await pasadaService.registrarLineaParada(testLine.id, testUser.id, 'Falta de energía');
      expect(pasada.estado).toBe(PasadaEstado.PARADA);
      expect(pasada.numero).toBe(1);
      expect(pasada.motivoCierre).toBe('Falta de energía');
      expect(pasada.horaCierre).toBeDefined();
      expect(pasada.horaCierre!.getTime()).toBe(pasada.horaInicio.getTime());
      expect(pasada.usuario.id).toBe(testUser.id);
      expect(pasada.balanza.id).toBe(testBalanza.id);
      expect(pasada.articulo.id).toBe(testArticle.id);
    }));

    it('uses the given balanza when idBalanza is provided', () => runInContext(async () => {
      const pasada = await pasadaService.registrarLineaParada(testLine.id, testUser.id, 'Sin materia prima', testBalanza.id);
      expect(pasada.balanza.id).toBe(testBalanza.id);
    }));

    it('converts and closes the running pasada instead of creating another one', () => runInContext(async () => {
      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.OPERARIO);
      const enCurso = await pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id, 'arranque');

      const parada = await pasadaService.registrarLineaParada(testLine.id, testUser.id, 'Se cortó la cinta');
      expect(parada.id).toBe(enCurso.id);
      expect(parada.estado).toBe(PasadaEstado.PARADA);
      expect(parada.motivoCierre).toBe('Se cortó la cinta');
      expect(parada.observacion).toBe('arranque');
      expect(parada.horaCierre).toBeDefined();

      expect(sesionService.obtenerSesion(testLine.id)!.pasadaId).toBeNull();
      const total = await orm.em.fork().count(Pasada, { lineaProduccion: testLine.id });
      expect(total).toBe(1);
    }));

    it('rejects an empty or whitespace observation and persists nothing', () => runInContext(async () => {
      await expect(pasadaService.registrarLineaParada(testLine.id, testUser.id, ''))
        .rejects.toThrow('Se requiere una observación para registrar la línea parada');
      await expect(pasadaService.registrarLineaParada(testLine.id, testUser.id, '   '))
        .rejects.toThrow('Se requiere una observación para registrar la línea parada');
      expect(await orm.em.fork().count(Pasada, {})).toBe(0);
    }));

    it('rejects edits and deletion of a parada like any closed pasada', () => runInContext(async () => {
      const pasada = await pasadaService.registrarLineaParada(testLine.id, testUser.id, 'Motivo');
      await expect(pasadaService.update(pasada.id, { numero: 9 }))
        .rejects.toThrow('No se puede actualizar una pasada completada o abortada');
      await expect(pasadaService.softDelete(pasada.id))
        .rejects.toThrow('No se puede eliminar una pasada completada o abortada');
      const updated = await pasadaService.update(pasada.id, { observacion: 'nota' });
      expect(updated!.observacion).toBe('nota');
    }));

    it('keeps completar and abortar working on a running pasada (unchanged)', () => runInContext(async () => {
      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.OPERARIO);
      const p1 = await pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id);
      expect((await pasadaService.completarPasada(p1.id))!.estado).toBe(PasadaEstado.COMPLETA);
      const p2 = await pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id);
      expect((await pasadaService.abortarPasada(p2.id, 'x'))!.estado).toBe(PasadaEstado.ABORTADA);
    }));
  });

  describe('Restrictions on Completed Records (Pasada Only)', () => {
    it('should reject updates and soft-deletes of completed Pasadas', () => runInContext(async () => {
      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.OPERARIO);
      const pasada = await pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id);
      
      await pasadaService.completarPasada(pasada.id);
      
      await expect(pasadaService.update(pasada.id, { numero: 99 }))
        .rejects.toThrow('No se puede actualizar una pasada completada o abortada');
      await expect(pasadaService.softDelete(pasada.id))
        .rejects.toThrow('No se puede eliminar una pasada completada o abortada');
    }));

    it('should successfully abort a pasada and reject subsequent operations', () => runInContext(async () => {
      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.OPERARIO);
      const pasada = await pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id);
      
      const abortedPasada = await pasadaService.abortarPasada(pasada.id, 'Motivo de prueba');
      expect(abortedPasada!.estado).toBe(PasadaEstado.ABORTADA);
      
      const session = sesionService.obtenerSesion(testLine.id);
      expect(session!.pasadaId).toBeNull();
      
      await expect(pasadaService.update(pasada.id, { numero: 12 }))
        .rejects.toThrow('No se puede actualizar una pasada completada o abortada');
      await expect(pasadaService.softDelete(pasada.id))
        .rejects.toThrow('No se puede eliminar una pasada completada o abortada');
    }));

    it('should allow updating observacion on a completed pasada', () => runInContext(async () => {
      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.OPERARIO);
      const pasada = await pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id);

      await pasadaService.completarPasada(pasada.id);

      const updated = await pasadaService.update(pasada.id, { observacion: 'nota post-cierre' });
      expect(updated!.observacion).toBe('nota post-cierre');
    }));

    it('should allow updating observacion on an aborted pasada', () => runInContext(async () => {
      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.OPERARIO);
      const pasada = await pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id);

      await pasadaService.abortarPasada(pasada.id, 'Motivo de prueba');

      const updated = await pasadaService.update(pasada.id, { observacion: 'nota post-aborto' });
      expect(updated!.observacion).toBe('nota post-aborto');
    }));

    it('should reject a mixed payload with observacion and another field on a closed pasada, persisting neither', () => runInContext(async () => {
      sesionService.iniciarSesion(testLine.id, testUser.id, UsuarioRol.OPERARIO);
      const pasada = await pasadaService.iniciarPasada(testLine.id, testBalanza.id, testUser.id);

      await pasadaService.completarPasada(pasada.id);

      await expect(
        pasadaService.update(pasada.id, { observacion: 'nota mixta', numero: 42 })
      ).rejects.toThrow('No se puede actualizar una pasada completada o abortada');

      const reloaded = await pasadaService.findById(pasada.id);
      expect(reloaded!.observacion ?? null).toBeNull();
      expect(reloaded!.numero).toBe(pasada.numero);
    }));
  });
});
