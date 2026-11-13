import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MikroORM, SchemaGenerator, RequestContext, wrap } from '@mikro-orm/postgresql';
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
import { RutaPasadaService } from './ruta-pasada.service.js';
import { ValidationError } from '../utils/errors.js';
import { UsuarioRol } from '../shared/types.js';

describe('RutaPasadaService atributos (integration)', () => {
  let orm: MikroORM;
  const service = new RutaPasadaService();
  let etapaId: number;

  const inCtx = <T>(fn: () => Promise<T>) => RequestContext.create(orm.em, fn) as Promise<T>;
  const etapaBase = () => ({ etapa: etapaId, orden: 1, pesoIdeal: 10, pesoMinimo: 9, pesoMaximo: 11, cantidadMuestrasRequeridas: 3 });
  const json = (r: unknown) => wrap(r as RutaPasada).toObject() as unknown as { etapas: Array<{ id: number; atributos: Array<Record<string, unknown>> }> };
  let n = 0;
  const rutaNombre = () => `Ruta atributos ${++n}`;

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
    const em = orm.em.fork();
    const etapa = Object.assign(new Etapa(), { nombre: 'Horno' });
    await em.persist(etapa).flush();
    etapaId = etapa.id;
  });

  afterAll(async () => {
    if (orm) await orm.close();
  });

  it('create persists atributos and GET returns them with the acceptance range', async () => {
    const created = await inCtx(() =>
      service.create({
        nombre: rutaNombre(),
        etapas: [{ ...etapaBase(), atributos: [{ nombre: 'Temperatura (°C)', tipo: 'numerico', minimo: 0, maximo: 99 }, { nombre: 'Degustación', tipo: 'aceptado' }] }],
      } as never),
    );
    const found = await inCtx(() => service.findById(created.id));
    const atributos = json(found).etapas[0].atributos;
    expect(atributos).toHaveLength(2);
    expect(atributos[0]).toMatchObject({ nombre: 'Temperatura (°C)', tipo: 'numerico', minimo: 0, maximo: 99, activo: true });
    expect(atributos[1]).toMatchObject({ nombre: 'Degustación', tipo: 'aceptado', minimo: 1, maximo: 1 });
  });

  it('update edits, adds and removes atributos, and the response and GET only carry the remaining ones', async () => {
    const created = await inCtx(() =>
      service.create({ nombre: rutaNombre(), etapas: [{ ...etapaBase(), atributos: [{ nombre: 'A', tipo: 'numerico', minimo: 0, maximo: 5 }, { nombre: 'B', tipo: 'numerico', minimo: 0, maximo: 5 }] }] } as never),
    );
    const [a] = json(created).etapas[0].atributos;
    const pivotId = json(created).etapas[0].id;

    const updated = await inCtx(() =>
      service.update(created.id, {
        etapas: [{ ...etapaBase(), id: pivotId, atributos: [{ id: a.id, nombre: 'A renombrada', tipo: 'numerico', minimo: 1, maximo: 9 }, { nombre: 'C', tipo: 'aceptado' }] }],
      } as never),
    );
    expect(json(updated).etapas[0].atributos.map((x) => x.nombre)).toEqual(['A renombrada', 'C']);

    const found = await inCtx(() => service.findById(created.id));
    expect(json(found).etapas[0].atributos.map((x) => x.nombre)).toEqual(['A renombrada', 'C']);
    expect(json(found).etapas[0].atributos[0]).toMatchObject({ minimo: 1, maximo: 9 });

    // B had no loaded values: it is deleted, not just deactivated
    const total = await orm.em.fork().count(AtributoEtapaRuta, { rutaPasadaEtapa: pivotId });
    expect(total).toBe(2);
  });

  it('update without atributos leaves them as they were (previous behavior)', async () => {
    const created = await inCtx(() =>
      service.create({ nombre: rutaNombre(), etapas: [{ ...etapaBase(), atributos: [{ nombre: 'A', tipo: 'numerico', minimo: 0, maximo: 5 }] }] } as never),
    );
    const pivotId = json(created).etapas[0].id;
    await inCtx(() => service.update(created.id, { etapas: [{ ...etapaBase(), id: pivotId, pesoIdeal: 12 }] } as never));
    const found = await inCtx(() => service.findById(created.id));
    expect(json(found).etapas[0].atributos).toHaveLength(1);
  });

  it('removes an etapa that has none', async () => {
    const sinAtributos = await inCtx(() => service.create({ nombre: rutaNombre(), etapas: [etapaBase()] } as never));
    await inCtx(() => service.update(sinAtributos.id, { etapas: [] } as never));
    expect(await orm.em.fork().count(RutaPasadaEtapa, { rutaPasada: sinAtributos.id })).toBe(0);
  });

  it('GET returns every etapa of a ruta, including etapas without atributos', async () => {
    const em = orm.em.fork();
    const extra = [Object.assign(new Etapa(), { nombre: 'Enfriado' }), Object.assign(new Etapa(), { nombre: 'Envasado' })];
    await em.persist(extra).flush();
    const created = await inCtx(() =>
      service.create({
        nombre: rutaNombre(),
        etapas: [
          { ...etapaBase(), orden: 1 },
          { ...etapaBase(), etapa: extra[0].id, orden: 2, atributos: [{ nombre: 'Sabor', tipo: 'aceptado' }] },
          { ...etapaBase(), etapa: extra[1].id, orden: 3 },
        ],
      } as never),
    );

    const byId = json(await inCtx(() => service.findById(created.id) as Promise<RutaPasada>));
    expect(byId.etapas).toHaveLength(3);
    expect(byId.etapas.map((e) => e.atributos.length).sort()).toEqual([0, 0, 1]);

    const all = (await inCtx(() => service.findAll())).find((r) => r.id === created.id);
    expect(json(all as RutaPasada).etapas).toHaveLength(3);
  });
  describe('removing a cualidad', () => {
    const rutaConDos = async () => {
      const created = await inCtx(() =>
        service.create({
          nombre: rutaNombre(),
          etapas: [{ ...etapaBase(), atributos: [{ nombre: 'Temperatura', tipo: 'numerico', minimo: 0, maximo: 99 }, { nombre: 'Degustación', tipo: 'aceptado' }] }],
        } as never),
      );
      const [etapa] = json(created).etapas;
      return { rutaId: created.id as number, etapaPivotId: etapa.id, atributos: etapa.atributos as Array<{ id: number; nombre: string }> };
    };

    /** A real value loaded in a pasada for the atributo (what makes it history). */
    const cargarValor = async (rutaId: number, atributoId: number) => {
      const em = orm.em.fork();
      const usuario = Object.assign(new Usuario(), {
        nombreApellido: 'Op', nombreUsuario: `op${++n}`, legajo: `L${n}`, pinHash: 'h', rol: UsuarioRol.OPERARIO, puedeTomarMuestrasLibres: true,
      });
      const balanza = Object.assign(new Balanza(), { nombre: `B${n}`, activo: true });
      const articulo = Object.assign(new Articulo(), { codigo: `ART${n}` });
      await em.persist([usuario, balanza, articulo]).flush();
      const linea = Object.assign(new LineaProduccion(), { activo: true, nombre: `L${n}`, rutaPasadaActiva: em.getReference(RutaPasada, rutaId), balanza, articulo });
      await em.persist(linea).flush();
      const pasada = Object.assign(new Pasada(), { lineaProduccion: linea, rutaPasada: em.getReference(RutaPasada, rutaId), articulo, balanza, usuario, numero: 1 });
      await em.persist(pasada).flush();
      const valor = Object.assign(new ValorAtributo(), {
        pasada, etapa: em.getReference(Etapa, etapaId), atributo: em.getReference(AtributoEtapaRuta, atributoId), usuario,
        valor: 10, nombre: 'snapshot', tipo: 'numerico', minimo: 0, maximo: 99, estadoValidacion: 'ok',
      });
      await em.persist(valor).flush();
    };

    const filas = (rutaPivotId: number) => orm.em.fork().find(AtributoEtapaRuta, { rutaPasadaEtapa: rutaPivotId }, { orderBy: { id: 'asc' } });

    it('deletes the row for good when it has no loaded values, and the response no longer carries it', async () => {
      const { rutaId, etapaPivotId, atributos } = await rutaConDos();
      const [temperatura] = atributos;

      const updated = await inCtx(() =>
        service.update(rutaId, { etapas: [{ ...etapaBase(), id: etapaPivotId, atributos: [{ id: temperatura.id, nombre: 'Temperatura', tipo: 'numerico', minimo: 0, maximo: 99 }] }] } as never),
      );

      expect(json(updated!).etapas[0].atributos.map((a) => a.nombre)).toEqual(['Temperatura']);
      expect((await filas(etapaPivotId)).map((a) => a.nombre)).toEqual(['Temperatura']);
    });

    it('only deactivates it when it already has loaded values, keeping the row and its value', async () => {
      const { rutaId, etapaPivotId, atributos } = await rutaConDos();
      const [temperatura, degustacion] = atributos;
      await cargarValor(rutaId, degustacion.id);

      await inCtx(() =>
        service.update(rutaId, { etapas: [{ ...etapaBase(), id: etapaPivotId, atributos: [{ id: temperatura.id, nombre: 'Temperatura', tipo: 'numerico', minimo: 0, maximo: 99 }] }] } as never),
      );

      const todas = await filas(etapaPivotId);
      expect(todas.map((a) => [a.nombre, a.activo])).toEqual([['Temperatura', true], ['Degustación', false]]);
      expect(await orm.em.fork().count(ValorAtributo, { atributo: degustacion.id })).toBe(1);
    });

    it('removes an etapa whose cualidades have no loaded values, cualidades included', async () => {
      const { rutaId, etapaPivotId } = await rutaConDos();

      await inCtx(() => service.update(rutaId, { etapas: [] } as never));

      expect(await orm.em.fork().count(RutaPasadaEtapa, { rutaPasada: rutaId })).toBe(0);
      expect(await filas(etapaPivotId)).toHaveLength(0);
    });

    it('refuses to remove an etapa that has a cualidad with loaded values, and removes nothing', async () => {
      const { rutaId, etapaPivotId, atributos } = await rutaConDos();
      await cargarValor(rutaId, atributos[0].id);

      await expect(inCtx(() => service.update(rutaId, { etapas: [] } as never))).rejects.toBeInstanceOf(ValidationError);

      expect(await orm.em.fork().count(RutaPasadaEtapa, { rutaPasada: rutaId })).toBe(1);
      expect(await filas(etapaPivotId)).toHaveLength(2);
    });
  });
});
