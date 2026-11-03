import 'reflect-metadata';
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { MikroORM, SchemaGenerator } from '@mikro-orm/postgresql';
import config from '../../mikro-orm.config.js';
import {
  Usuario,
  LineaProduccion,
  Articulo,
  Etapa,
  RutaPasada,
  Pasada,
  Muestra,
  UsuarioRol,
  PasadaEstado,
  MuestraEstadoValidacion,
  ArticuloRutaPasada,
  Balanza,
  RutaPasadaEtapa,
} from '../models/index.js';
import { historialService } from './historial.service.js';
import { clearDatabase } from '../test-utils/db-teardown.js';

describe('historialService (integration)', () => {
  let orm: MikroORM;
  let userA: Usuario;
  let userB: Usuario;
  let etapaMezcla: Etapa;
  let etapaHorno: Etapa;
  let artAlfajor: Articulo;
  let artGalleta: Articulo;
  let pasadaAlfajor: Pasada;
  let pasadaGalleta: Pasada;
  let ruta: RutaPasada;
  let linea: LineaProduccion;

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...config,
      dbName: 'control_pesaje_test',
      extensions: [SchemaGenerator],
      entities: [Usuario, LineaProduccion, Articulo, Etapa, RutaPasada, Pasada, Muestra, ArticuloRutaPasada, Balanza, RutaPasadaEtapa],
      entitiesTs: [],
      allowGlobalContext: true,
    });
    const generator = orm.schema;
    await generator.ensureDatabase();
    await generator.drop();
    await generator.create();
  });

  afterAll(async () => {
    if (orm) await orm.close();
  });

  const newUser = (nombreUsuario: string, legajo: string) => {
    const u = new Usuario();
    u.nombreApellido = nombreUsuario;
    u.nombreUsuario = nombreUsuario;
    u.legajo = legajo;
    u.pinHash = 'hash';
    u.rol = UsuarioRol.OPERARIO;
    u.puedeTomarMuestrasLibres = true;
    return u;
  };

  const addMuestra = (
    em: ReturnType<MikroORM['em']['fork']>,
    opts: {
      usuario: Usuario;
      etapa: Etapa;
      pasada?: Pasada;
      estado?: MuestraEstadoValidacion;
      timestamp?: Date;
      observacion?: string;
      pesoNeto?: number;
    },
  ) => {
    const m = new Muestra();
    m.usuario = opts.usuario;
    m.etapa = opts.etapa;
    m.rutaPasada = ruta;
    m.lineaProduccion = linea;
    if (opts.pasada) m.pasada = opts.pasada;
    m.pesoNeto = opts.pesoNeto ?? 100;
    m.pesoIdeal = 100;
    m.pesoMinimo = 90;
    m.pesoMaximo = 110;
    m.estadoValidacion = opts.estado ?? MuestraEstadoValidacion.OK;
    m.observacion = opts.observacion;
    m.timestamp = opts.timestamp ?? new Date();
    em.persist(m);
    return m;
  };

  beforeEach(async () => {
    await clearDatabase(orm);
    const em = orm.em.fork();

    userA = newUser('ana', '00001');
    userB = newUser('beto', '00002');
    em.persist([userA, userB]);

    ruta = new RutaPasada();
    ruta.nombre = 'Ruta Estándar';
    em.persist(ruta);

    const balanza = new Balanza();
    balanza.nombre = 'Balanza Test';
    em.persist(balanza);

    artAlfajor = new Articulo();
    artAlfajor.codigo = 'ALF-01';
    artAlfajor.nombre = 'Alfajor Triple';
    artGalleta = new Articulo();
    artGalleta.codigo = 'GAL-01';
    artGalleta.nombre = 'Galleta Cremosa';
    em.persist([artAlfajor, artGalleta]);

    linea = new LineaProduccion();
    linea.nombre = 'Línea 1';
    linea.balanza = balanza;
    linea.articulo = artAlfajor;
    em.persist(linea);

    etapaMezcla = new Etapa();
    etapaMezcla.nombre = 'Mezcla';
    etapaHorno = new Etapa();
    etapaHorno.nombre = 'Horneado';
    em.persist([etapaMezcla, etapaHorno]);
    await em.flush();

    let numero = 0;
    const mkPasada = (usuario: Usuario, articulo: Articulo) => {
      const p = new Pasada();
      p.numero = ++numero;
      p.lineaProduccion = linea;
      p.rutaPasada = ruta;
      p.articulo = articulo;
      p.balanza = balanza;
      p.usuario = usuario;
      p.estado = PasadaEstado.EN_CURSO;
      return p;
    };
    pasadaAlfajor = mkPasada(userA, artAlfajor);
    pasadaGalleta = mkPasada(userA, artGalleta);
    em.persist([pasadaAlfajor, pasadaGalleta]);
    await em.flush();
  });

  const base = { page: 1, pageSize: 20 };

  it('returns only the muestras of the given user (ownership isolation)', async () => {
    const em = orm.em.fork();
    addMuestra(em, { usuario: userA, etapa: etapaMezcla, pasada: pasadaAlfajor });
    addMuestra(em, { usuario: userA, etapa: etapaMezcla });
    addMuestra(em, { usuario: userB, etapa: etapaMezcla });
    await em.flush();

    const a = await historialService.list(orm.em.fork(), userA.id, base);
    const b = await historialService.list(orm.em.fork(), userB.id, base);

    expect(a.total).toBe(2);
    expect(a.items).toHaveLength(2);
    expect(b.total).toBe(1);
    expect(b.kpis.total).toBe(1);
  });

  it('includes free muestras (no pasada) with null articulo', async () => {
    const em = orm.em.fork();
    addMuestra(em, { usuario: userA, etapa: etapaMezcla });
    await em.flush();

    const r = await historialService.list(orm.em.fork(), userA.id, base);

    expect(r.items).toHaveLength(1);
    expect(r.items[0].pasadaId).toBeNull();
    expect(r.items[0].articulo).toBeNull();
    expect(r.items[0].etapa.nombre).toBe('Mezcla');
    expect(r.items[0].rutaPasada.nombre).toBe('Ruta Estándar');
  });

  it('orders newest first', async () => {
    const em = orm.em.fork();
    addMuestra(em, { usuario: userA, etapa: etapaMezcla, observacion: 'vieja', timestamp: new Date('2026-10-01T10:00:00Z') });
    addMuestra(em, { usuario: userA, etapa: etapaMezcla, observacion: 'nueva', timestamp: new Date('2026-10-02T10:00:00Z') });
    await em.flush();

    const r = await historialService.list(orm.em.fork(), userA.id, base);

    expect(r.items.map(i => i.observacion)).toEqual(['nueva', 'vieja']);
  });

  it('filters by etapa and by articulo', async () => {
    const em = orm.em.fork();
    addMuestra(em, { usuario: userA, etapa: etapaMezcla, pasada: pasadaAlfajor });
    addMuestra(em, { usuario: userA, etapa: etapaHorno, pasada: pasadaAlfajor });
    addMuestra(em, { usuario: userA, etapa: etapaHorno, pasada: pasadaGalleta });
    addMuestra(em, { usuario: userA, etapa: etapaHorno });
    await em.flush();

    const porEtapa = await historialService.list(orm.em.fork(), userA.id, { ...base, etapaId: etapaHorno.id });
    const porArticulo = await historialService.list(orm.em.fork(), userA.id, { ...base, articuloId: artAlfajor.id });
    const ambos = await historialService.list(orm.em.fork(), userA.id, {
      ...base,
      etapaId: etapaHorno.id,
      articuloId: artAlfajor.id,
    });

    expect(porEtapa.total).toBe(3);
    expect(porArticulo.total).toBe(2);
    expect(ambos.total).toBe(1);
    expect(ambos.kpis.total).toBe(1);
  });

  it('filters by date range (inclusive bounds)', async () => {
    const em = orm.em.fork();
    addMuestra(em, { usuario: userA, etapa: etapaMezcla, timestamp: new Date('2026-10-01T12:00:00Z') });
    addMuestra(em, { usuario: userA, etapa: etapaMezcla, timestamp: new Date('2026-10-05T12:00:00Z') });
    addMuestra(em, { usuario: userA, etapa: etapaMezcla, timestamp: new Date('2026-10-10T12:00:00Z') });
    await em.flush();

    const r = await historialService.list(orm.em.fork(), userA.id, {
      ...base,
      desde: new Date('2026-10-02T00:00:00Z'),
      hasta: new Date('2026-10-09T23:59:59Z'),
    });

    expect(r.total).toBe(1);
    expect(r.kpis.total).toBe(1);
  });

  it('searches by coincidence, ignoring case and accents, over visible text', async () => {
    const em = orm.em.fork();
    addMuestra(em, { usuario: userA, etapa: etapaMezcla, pasada: pasadaAlfajor, observacion: 'Masa pegajosa' });
    addMuestra(em, { usuario: userA, etapa: etapaHorno, pasada: pasadaGalleta, observacion: 'Todo bien' });
    await em.flush();

    const search = (q: string) => historialService.list(orm.em.fork(), userA.id, { ...base, q });

    expect((await search('ALFAJOR')).total).toBe(1); // articulo nombre, case-insensitive
    expect((await search('gal-01')).total).toBe(1); // articulo codigo
    expect((await search('horneado')).total).toBe(1); // etapa
    expect((await search('estandar')).total).toBe(2); // ruta, accent-insensitive ("Estándar")
    expect((await search('pegajosa')).total).toBe(1); // observacion
    expect((await search('inexistente')).total).toBe(0);
    expect((await search('%')).total).toBe(0); // LIKE wildcards are literals
  });

  it('computes KPIs over the whole filtered set, not just the page', async () => {
    const em = orm.em.fork();
    for (let i = 0; i < 3; i++) addMuestra(em, { usuario: userA, etapa: etapaMezcla });
    addMuestra(em, { usuario: userA, etapa: etapaMezcla, estado: MuestraEstadoValidacion.FUERA_DE_RANGO });
    addMuestra(em, { usuario: userA, etapa: etapaHorno, estado: MuestraEstadoValidacion.FUERA_DE_RANGO });
    await em.flush();

    const r = await historialService.list(orm.em.fork(), userA.id, { page: 1, pageSize: 2 });

    expect(r.items).toHaveLength(2);
    expect(r.kpis).toEqual({ total: 5, ok: 3, fueraRango: 2, porcentajeOk: 60, porcentajeFueraRango: 40 });

    const soloMezcla = await historialService.list(orm.em.fork(), userA.id, {
      page: 1,
      pageSize: 2,
      etapaId: etapaMezcla.id,
    });
    expect(soloMezcla.kpis).toEqual({ total: 4, ok: 3, fueraRango: 1, porcentajeOk: 75, porcentajeFueraRango: 25 });
  });

  it('returns zeroed KPIs for an empty set (no division by zero)', async () => {
    const r = await historialService.list(orm.em.fork(), userA.id, base);

    expect(r.total).toBe(0);
    expect(r.items).toEqual([]);
    expect(r.kpis).toEqual({ total: 0, ok: 0, fueraRango: 0, porcentajeOk: 0, porcentajeFueraRango: 0 });
  });

  it('paginates server-side', async () => {
    const em = orm.em.fork();
    for (let i = 0; i < 5; i++) {
      addMuestra(em, { usuario: userA, etapa: etapaMezcla, observacion: `m${i}`, timestamp: new Date(2026, 9, 1 + i) });
    }
    await em.flush();

    const p1 = await historialService.list(orm.em.fork(), userA.id, { page: 1, pageSize: 2 });
    const p3 = await historialService.list(orm.em.fork(), userA.id, { page: 3, pageSize: 2 });

    expect(p1.items.map(i => i.observacion)).toEqual(['m4', 'm3']);
    expect(p3.items.map(i => i.observacion)).toEqual(['m0']);
    expect(p1.total).toBe(5);
    expect(p1.page).toBe(1);
    expect(p1.pageSize).toBe(2);
  });
});
