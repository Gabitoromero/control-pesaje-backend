import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MikroORM, SchemaGenerator, wrap } from '@mikro-orm/postgresql';
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
} from './index.js';
import { UsuarioRol } from '../shared/types.js';

describe('Atributo de etapa-ruta y valor de atributo', () => {
  let orm: MikroORM;

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

  let n = 0;
  async function seed() {
    n += 1;
    const em = orm.em.fork();
    const usuario = Object.assign(new Usuario(), { nombreApellido: 'Op', nombreUsuario: `op.attr${n}`, legajo: `900${n}`, pinHash: 'h', rol: UsuarioRol.OPERARIO });
    const balanza = Object.assign(new Balanza(), { nombre: `B${n}`, activo: true });
    const articulo = Object.assign(new Articulo(), { codigo: `A-${n}` });
    const linea = Object.assign(new LineaProduccion(), { nombre: `L${n}`, balanza, articulo });
    const etapa = Object.assign(new Etapa(), { nombre: `Horno${n}` });
    const ruta = Object.assign(new RutaPasada(), { nombre: `R${n}` });
    await em.persist([usuario, balanza, articulo, linea, etapa, ruta]).flush();
    const rutaEtapa = Object.assign(new RutaPasadaEtapa(), { rutaPasada: ruta, etapa, orden: 1, pesoIdeal: 10, pesoMinimo: 9, pesoMaximo: 11, cantidadMuestrasRequeridas: 3 });
    const pasada = Object.assign(new Pasada(), { lineaProduccion: linea, rutaPasada: ruta, articulo, balanza, usuario, numero: 1 });
    await em.persist([rutaEtapa, pasada]).flush();
    return { em, usuario, etapa, rutaEtapa, pasada };
  }

  it('persists a numeric atributo with its range and a value with a range snapshot', async () => {
    const { em, usuario, etapa, rutaEtapa, pasada } = await seed();
    const atributo = Object.assign(new AtributoEtapaRuta(), { rutaPasadaEtapa: rutaEtapa, nombre: 'Temperatura (°C)', tipo: 'numerico', minimo: 0, maximo: 99 });
    await em.persist(atributo).flush();
    const valor = Object.assign(new ValorAtributo(), {
      pasada, etapa, atributo, usuario, valor: 120.12346, nombre: atributo.nombre, tipo: atributo.tipo, minimo: 0, maximo: 99, estadoValidacion: 'fuera_de_rango',
    });
    await em.persist(valor).flush();
    em.clear();

    const stored = await em.findOneOrFail(ValorAtributo, valor.id);
    const json = wrap(stored).toJSON();
    expect(json.valor).toBe(120.1235);
    expect(json.minimo).toBe(0);
    expect(json.maximo).toBe(99);
    expect(json.estadoValidacion).toBe('fuera_de_rango');
    expect(stored.timestamp).toBeInstanceOf(Date);
    const attr = await em.findOneOrFail(AtributoEtapaRuta, atributo.id);
    expect(attr.activo).toBe(true);
  });

  it('stores an aceptado atributo with range 1..1 and value 0 or 1', async () => {
    const { em, usuario, etapa, rutaEtapa, pasada } = await seed();
    const atributo = Object.assign(new AtributoEtapaRuta(), { rutaPasadaEtapa: rutaEtapa, nombre: 'Degustación', tipo: 'aceptado', minimo: 1, maximo: 1 });
    await em.persist(atributo).flush();
    const valor = Object.assign(new ValorAtributo(), {
      pasada, etapa, atributo, usuario, valor: 0, nombre: 'Degustación', tipo: 'aceptado', minimo: 1, maximo: 1, estadoValidacion: 'fuera_de_rango',
    });
    await em.persist(valor).flush();
    em.clear();
    const stored = await em.findOneOrFail(ValorAtributo, valor.id);
    expect(wrap(stored).toJSON().valor).toBe(0);
    expect(stored.tipo).toBe('aceptado');
  });

  it('rejects a second value for the same pasada and atributo (values are never corrected)', async () => {
    const { em, usuario, etapa, rutaEtapa, pasada } = await seed();
    const atributo = Object.assign(new AtributoEtapaRuta(), { rutaPasadaEtapa: rutaEtapa, nombre: 'Altura', tipo: 'numerico', minimo: 0, maximo: 99 });
    await em.persist(atributo).flush();
    const base = { pasada, etapa, atributo, usuario, nombre: 'Altura', tipo: 'numerico' as const, minimo: 0, maximo: 99, estadoValidacion: 'ok' as const };
    await em.persist(Object.assign(new ValorAtributo(), { ...base, valor: 10 })).flush();
    await expect(em.fork().persist(Object.assign(new ValorAtributo(), { ...base, valor: 20 })).flush()).rejects.toThrow();
  });

  it('rejects an unknown tipo and an unknown estadoValidacion at database level', async () => {
    const { em, usuario, etapa, rutaEtapa, pasada } = await seed();
    const bad = Object.assign(new AtributoEtapaRuta(), { rutaPasadaEtapa: rutaEtapa, nombre: 'X', tipo: 'texto' as never, minimo: 0, maximo: 1 });
    await expect(em.fork().persist(bad).flush()).rejects.toThrow();

    // Fresh graph: the invalid atributo above is still attached to the first rutaEtapa collection.
    const { em: em2, usuario: usuario2, etapa: etapa2, rutaEtapa: rutaEtapa2, pasada: pasada2 } = await seed();
    const atributo = Object.assign(new AtributoEtapaRuta(), { rutaPasadaEtapa: rutaEtapa2, nombre: 'Y', tipo: 'numerico', minimo: 0, maximo: 1 });
    await em2.persist(atributo).flush();
    const badValor = Object.assign(new ValorAtributo(), { pasada: pasada2, etapa: etapa2, atributo, usuario: usuario2, valor: 1, nombre: 'Y', tipo: 'numerico', minimo: 0, maximo: 1, estadoValidacion: 'raro' as never });
    await expect(em2.fork().persist(badValor).flush()).rejects.toThrow();
  });
});
