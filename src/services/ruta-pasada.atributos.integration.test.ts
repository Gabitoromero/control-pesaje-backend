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

  it('update edits, adds and deactivates atributos, and the response and GET only carry the active ones', async () => {
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

    // B is deactivated, not deleted
    const total = await orm.em.fork().count(AtributoEtapaRuta, { rutaPasadaEtapa: pivotId });
    expect(total).toBe(3);
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

  it('refuses to remove an etapa that has atributos and removes one that has none', async () => {
    const conAtributos = await inCtx(() =>
      service.create({ nombre: rutaNombre(), etapas: [{ ...etapaBase(), atributos: [{ nombre: 'A', tipo: 'numerico', minimo: 0, maximo: 5 }] }] } as never),
    );
    await expect(inCtx(() => service.update(conAtributos.id, { etapas: [] } as never))).rejects.toBeInstanceOf(ValidationError);
    expect(await orm.em.fork().count(RutaPasadaEtapa, { rutaPasada: conAtributos.id })).toBe(1);

    const sinAtributos = await inCtx(() => service.create({ nombre: rutaNombre(), etapas: [etapaBase()] } as never));
    await inCtx(() => service.update(sinAtributos.id, { etapas: [] } as never));
    expect(await orm.em.fork().count(RutaPasadaEtapa, { rutaPasada: sinAtributos.id })).toBe(0);
  });
});
