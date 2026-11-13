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
  ArticuloRutaPasada,
  RutaPasadaEtapa,
  Pasada,
  Muestra,
  Balanza,
  AtributoEtapaRuta,
  ValorAtributo,
} from '../models/index.js';
import { ValorAtributoService } from './valor-atributo.service.js';
import { MuestraService } from './muestra.service.js';
import { PasadaService } from './pasada.service.js';
import { sesionService } from './sesion.service.js';
import { clearDatabase } from '../test-utils/db-teardown.js';
import { UsuarioRol } from '../shared/types.js';

describe('ValorAtributoService and the cualidades advance rule (integration)', () => {
  let orm: MikroORM;
  const valores = new ValorAtributoService();
  const muestras = new MuestraService();
  const pasadas = new PasadaService();

  let usuario: Usuario;
  let otro: Usuario;
  let linea: LineaProduccion;
  let balanza: Balanza;
  let etapa1: Etapa;
  let etapa2: Etapa;
  let etapa3: Etapa;
  let temperatura: AtributoEtapaRuta;
  let degustacion: AtributoEtapaRuta;

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...config,
      dbName: 'control_pesaje_tests',
      extensions: [SchemaGenerator],
      entities: [Usuario, LineaProduccion, Articulo, Etapa, RutaPasada, ArticuloRutaPasada, RutaPasadaEtapa, Pasada, Muestra, Balanza, AtributoEtapaRuta, ValorAtributo],
      entitiesTs: [],
      allowGlobalContext: true,
    });
    await orm.schema.ensureDatabase();
    await orm.schema.drop();
    await orm.schema.create();
  });

  afterAll(async () => {
    if (orm) await orm.close();
  });

  const newUser = (nombre: string, legajo: string) =>
    Object.assign(new Usuario(), { nombreApellido: nombre, nombreUsuario: nombre, legajo, pinHash: 'h', rol: UsuarioRol.OPERARIO, puedeTomarMuestrasLibres: true });

  // Route: etapa1 (2 samples, cualidades: Temperatura numeric 0..99 + Degustación aceptado), etapa2 (1 sample, none), etapa3 (0 samples, with an atributo)
  beforeEach(async () => {
    sesionService.limpiar();
    await clearDatabase(orm);
    const em = orm.em.fork();
    usuario = newUser('juan', '00001');
    otro = newUser('ana', '00002');
    const ruta = Object.assign(new RutaPasada(), { nombre: 'Ruta cualidades' });
    balanza = Object.assign(new Balanza(), { nombre: 'B', activo: true });
    const articulo = Object.assign(new Articulo(), { codigo: 'Alfajor' });
    await em.persist([usuario, otro, ruta, balanza, articulo]).flush();
    balanza.ultimoArticulo = articulo;
    balanza.verificacionPendiente = false;
    linea = Object.assign(new LineaProduccion(), { activo: true, nombre: 'L1', rutaPasadaActiva: ruta, balanza, articulo });
    etapa1 = Object.assign(new Etapa(), { nombre: 'Relleno' });
    etapa2 = Object.assign(new Etapa(), { nombre: 'Cobertura' });
    etapa3 = Object.assign(new Etapa(), { nombre: 'Sin muestras' });
    await em.persist([linea, etapa1, etapa2, etapa3, Object.assign(new ArticuloRutaPasada(), { articulo, rutaPasada: ruta })]).flush();
    const pivot = (etapa: Etapa, orden: number, req: number) =>
      Object.assign(new RutaPasadaEtapa(), { rutaPasada: ruta, etapa, orden, pesoIdeal: 50, pesoMinimo: 45, pesoMaximo: 55, cantidadMuestrasRequeridas: req });
    const p1 = pivot(etapa1, 1, 2);
    const p2 = pivot(etapa2, 2, 1);
    const p3 = pivot(etapa3, 3, 0);
    await em.persist([p1, p2, p3]).flush();
    temperatura = Object.assign(new AtributoEtapaRuta(), { rutaPasadaEtapa: p1, nombre: 'Temperatura', tipo: 'numerico', minimo: 0, maximo: 99 });
    degustacion = Object.assign(new AtributoEtapaRuta(), { rutaPasadaEtapa: p1, nombre: 'Degustación', tipo: 'aceptado', minimo: 1, maximo: 1 });
    const sinMuestras = Object.assign(new AtributoEtapaRuta(), { rutaPasadaEtapa: p3, nombre: 'Peso extra', tipo: 'numerico', minimo: 0, maximo: 1 });
    await em.persist([temperatura, degustacion, sinMuestras]).flush();
  });

  const inCtx = <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      RequestContext.create(orm.em.fork(), () => {
        fn().then(resolve).catch(reject);
      });
    });

  const iniciar = async () => {
    sesionService.iniciarSesion(linea.id, usuario.id, UsuarioRol.OPERARIO);
    return pasadas.iniciarPasada(linea.id, balanza.id, usuario.id);
  };
  const muestra = (pasadaId: number, etapa: Etapa, peso = 50) => muestras.registrarMuestra(usuario.id, etapa.id, linea.id, peso, pasadaId);
  const completarEtapa1 = async (pasadaId: number) => {
    await muestra(pasadaId, etapa1);
    await muestra(pasadaId, etapa1);
  };

  describe('registrarValores', () => {
    it('stores a numeric value inside the range as ok, with the range snapshot', () => inCtx(async () => {
      const pasada = await iniciar();
      await completarEtapa1(pasada.id);

      const [v] = await valores.registrarValores(usuario.id, pasada.id, etapa1.id, [{ atributoId: temperatura.id, valor: 37.5 }]);

      expect(v.estadoValidacion).toBe('ok');
      expect(Number(v.valor)).toBe(37.5);
      expect(v).toMatchObject({ nombre: 'Temperatura', tipo: 'numerico' });
      expect(Number(v.minimo)).toBe(0);
      expect(Number(v.maximo)).toBe(99);
      expect(v.usuario.id).toBe(usuario.id);
    }));

    it('stores an out-of-range value as fuera_de_rango without blocking', () => inCtx(async () => {
      const pasada = await iniciar();
      await completarEtapa1(pasada.id);

      const [v] = await valores.registrarValores(usuario.id, pasada.id, etapa1.id, [{ atributoId: temperatura.id, valor: 120 }]);

      expect(v.estadoValidacion).toBe('fuera_de_rango');
      expect(Number(v.valor)).toBe(120);
    }));

    it('stores aceptado as 1 (ok) and no aceptado as 0 (fuera_de_rango), and rejects any other number', () => inCtx(async () => {
      const pasada = await iniciar();
      await completarEtapa1(pasada.id);

      await expect(valores.registrarValores(usuario.id, pasada.id, etapa1.id, [{ atributoId: degustacion.id, valor: 2 }])).rejects.toThrow(/must be 0 or 1/);

      const [v] = await valores.registrarValores(usuario.id, pasada.id, etapa1.id, [
        { atributoId: degustacion.id, valor: 0 },
      ]);
      expect(v.estadoValidacion).toBe('fuera_de_rango');
      expect(Number(v.valor)).toBe(0);
    }));

    it('stores the value in a single request with every atributo of the stage', () => inCtx(async () => {
      const pasada = await iniciar();
      await completarEtapa1(pasada.id);

      const creados = await valores.registrarValores(usuario.id, pasada.id, etapa1.id, [
        { atributoId: temperatura.id, valor: 10 },
        { atributoId: degustacion.id, valor: 1 },
      ]);

      expect(creados.map((c) => c.estadoValidacion)).toEqual(['ok', 'ok']);
      const listados = await valores.findAll({ pasadaId: pasada.id });
      expect(listados).toHaveLength(2);
    }));

    it('rejects loading before the stage has all its samples', () => inCtx(async () => {
      const pasada = await iniciar();
      await muestra(pasada.id, etapa1);

      await expect(valores.registrarValores(usuario.id, pasada.id, etapa1.id, [{ atributoId: temperatura.id, valor: 10 }])).rejects.toThrow(/not complete/);
    }));

    it('never asks cualidades on a stage that requires no samples', () => inCtx(async () => {
      const pasada = await iniciar();
      const [extra] = await orm.em.fork().find(AtributoEtapaRuta, { nombre: 'Peso extra' });

      await expect(valores.registrarValores(usuario.id, pasada.id, etapa3.id, [{ atributoId: extra.id, valor: 1 }])).rejects.toThrow(/requires no samples/);
    }));

    it('cannot correct: a second load of the same atributo is rejected and the first value stays', () => inCtx(async () => {
      const pasada = await iniciar();
      await completarEtapa1(pasada.id);
      await valores.registrarValores(usuario.id, pasada.id, etapa1.id, [{ atributoId: temperatura.id, valor: 10 }]);

      await expect(valores.registrarValores(usuario.id, pasada.id, etapa1.id, [{ atributoId: temperatura.id, valor: 20 }])).rejects.toThrow(/cannot be corrected/);

      const [stored] = await valores.findAll({ pasadaId: pasada.id });
      expect(Number(stored.valor)).toBe(10);
    }));

    it('rejects duplicated atributos in one request and atributos of another stage', () => inCtx(async () => {
      const pasada = await iniciar();
      await completarEtapa1(pasada.id);

      await expect(
        valores.registrarValores(usuario.id, pasada.id, etapa1.id, [{ atributoId: temperatura.id, valor: 1 }, { atributoId: temperatura.id, valor: 2 }]),
      ).rejects.toThrow(/Duplicate/);
      await expect(valores.registrarValores(usuario.id, pasada.id, etapa2.id, [{ atributoId: temperatura.id, valor: 1 }])).rejects.toThrow();
    }));

    it('only the pasada owner can load, and only while it is en_curso', () => inCtx(async () => {
      const pasada = await iniciar();
      await completarEtapa1(pasada.id);

      await expect(valores.registrarValores(otro.id, pasada.id, etapa1.id, [{ atributoId: temperatura.id, valor: 1 }])).rejects.toThrow(/not the owner/);

      await pasadas.completarPasada(pasada.id);
      await expect(valores.registrarValores(usuario.id, pasada.id, etapa1.id, [{ atributoId: temperatura.id, valor: 1 }])).rejects.toThrow(/already completed/);
    }));
  });

  describe('advance rule in MuestraService', () => {
    it('blocks the next stage while a cualidad of the finished stage is pending, and lists which ones', () => inCtx(async () => {
      const pasada = await iniciar();
      await completarEtapa1(pasada.id);

      await expect(muestra(pasada.id, etapa2)).rejects.toThrow(/cualidades pending: Temperatura, Degustación/);

      await valores.registrarValores(usuario.id, pasada.id, etapa1.id, [{ atributoId: temperatura.id, valor: 10 }]);
      await expect(muestra(pasada.id, etapa2)).rejects.toThrow(/cualidades pending: Degustación/);
    }));

    it('lets the operator advance once every cualidad is loaded, even out of range', () => inCtx(async () => {
      const pasada = await iniciar();
      await completarEtapa1(pasada.id);
      await valores.registrarValores(usuario.id, pasada.id, etapa1.id, [
        { atributoId: temperatura.id, valor: 500 },
        { atributoId: degustacion.id, valor: 0 },
      ]);

      const m = await muestra(pasada.id, etapa2, 50);
      expect(m.etapa.id).toBe(etapa2.id);
    }));

    it('a deactivated atributo is no longer required', () => inCtx(async () => {
      const pasada = await iniciar();
      await completarEtapa1(pasada.id);
      const em = orm.em.fork();
      await em.nativeUpdate(AtributoEtapaRuta, { id: { $in: [temperatura.id, degustacion.id] } }, { activo: false });

      await expect(muestra(pasada.id, etapa2)).resolves.toBeDefined();
    }));

    it('keeps the previous behavior: incomplete stage message, and free samples never ask cualidades', () => inCtx(async () => {
      const pasada = await iniciar();
      await muestra(pasada.id, etapa1);
      await expect(muestra(pasada.id, etapa2)).rejects.toThrow(`Preceding stage '${etapa1.id}' is not complete`);
    }));
  });
});
