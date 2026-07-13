import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MikroORM, SchemaGenerator, wrap } from '@mikro-orm/postgresql';
import type { PostgreSqlDriver } from '@mikro-orm/postgresql';
import config from '../mikro-orm.config.js';
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
  UsuarioRol,
  PasadaEstado,
  MuestraEstadoValidacion
} from './models/index.js';

describe('Domain Entities Integration Tests', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    // Initialize the ORM with explicit entities to avoid dynamic discovery errors
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
        ArticuloRutaPasada,
        RutaPasadaEtapa,
        Pasada,
        Muestra,
      ],
      entitiesTs: [], // Disable ts scanning in test
      allowGlobalContext: true,
    });

    // Synchronize database schema via SchemaGenerator
    const generator = orm.schema;
    await generator.ensureDatabase();
    await generator.drop();
    await generator.create();
  });

  afterAll(async () => {
    if (orm) {
      await orm.close();
    }
  });

  it('should discover all 9 core domain entities', () => {
    const entities = orm.config.get('entities');
    const entityNames = entities.map(e => typeof e === 'function' ? e.name : e);

    expect(entityNames).toContain('Usuario');
    expect(entityNames).toContain('LineaProduccion');
    expect(entityNames).toContain('Articulo');
    expect(entityNames).toContain('Etapa');
    expect(entityNames).toContain('RutaPasada');
    expect(entityNames).toContain('ArticuloRutaPasada');
    expect(entityNames).toContain('RutaPasadaEtapa');
    expect(entityNames).toContain('Pasada');
    expect(entityNames).toContain('Muestra');
    expect(entityNames.length).toBe(9);
  });

  it('should create and retrieve a Usuario with v1.5 shape (legajo, pinHash, no contrasenaHash)', async () => {
    const em = orm.em.fork();

    const usuario = new Usuario();
    usuario.nombreApellido = 'Juan Pérez';
    usuario.nombreUsuario = 'juan.perez';
    usuario.legajo = 'LEG123';
    usuario.pinHash = '$2b$10$hashedpinhere';
    // @ts-expect-error Testing that contrasenaHash no longer exists on the type
    usuario.contrasenaHash = 'should-not-exist';
    usuario.rol = UsuarioRol.OPERARIO;
    usuario.datosAdicionales = {
      preferenciasInterfaz: { tema: 'oscuro', idioma: 'es' },
    };

    await em.persist(usuario).flush();

    em.clear();

    const retrieved = await em.findOne(Usuario, { nombreUsuario: 'juan.perez' });
    expect(retrieved).not.toBeNull();
    expect(retrieved!.legajo).toBe('LEG123');
    expect(retrieved!.pinHash).toBe('$2b$10$hashedpinhere');
    expect((retrieved as any).contrasenaHash).toBeUndefined();
    expect(retrieved!.datosAdicionales).toEqual({
      preferenciasInterfaz: { tema: 'oscuro', idioma: 'es' },
    });
  });

  it('should enforce decimal precision (8,3) and rounding on RutaPasadaEtapa', async () => {
    const em = orm.em.fork();

    // Create required relations
    const rutaPasada = new RutaPasada();
    rutaPasada.nombre = 'Palito Bombón';

    const etapa = new Etapa();
    etapa.nombre = 'Cobertura';
    etapa.descripcion = 'Baño de chocolate chocolate amargo';

    await em.persist([rutaPasada, etapa]).flush();

    const rutaEtapa = new RutaPasadaEtapa();
    rutaEtapa.rutaPasada = rutaPasada;
    rutaEtapa.etapa = etapa;
    rutaEtapa.orden = 1;
    // Set 4 decimal places to verify DB-level rounding
    rutaEtapa.pesoIdeal = 12.3456;
    rutaEtapa.pesoMinimo = 10.1111;
    rutaEtapa.pesoMaximo = 15.9999;
    rutaEtapa.cantidadMuestrasRequeridas = 5;

    await em.persist(rutaEtapa).flush();

    em.clear();

    const retrieved = await em.findOne(RutaPasadaEtapa, {
      rutaPasada: rutaPasada.id,
      etapa: etapa.id,
    });

    expect(retrieved).not.toBeNull();
    // Serialized weights should be rounded to 3 decimal places
    const serialized = wrap(retrieved!).toJSON();

    expect(serialized.pesoIdeal).toBe(12.346);
    expect(serialized.pesoMinimo).toBe(10.111);
    expect(serialized.pesoMaximo).toBe(16.000);
  });

  it('should create and retrieve a Pasada and Muestra with decimal rounding on pesoNeto', async () => {
    const em = orm.em.fork();

    // Create required relations
    const usuario = new Usuario();
    usuario.nombreApellido = 'Test Operario';
    usuario.nombreUsuario = 'test.operario';
    usuario.legajo = 'TEST-123';
    usuario.pinHash = 'hash';
    usuario.rol = UsuarioRol.OPERARIO;

    const linea = new LineaProduccion();
    linea.nombre = 'Línea de Envasado 1';

    const articulo = new Articulo();
    articulo.nombre = 'Alfajor Triple';

    const etapa = new Etapa();
    etapa.nombre = 'Relleno';

    const rutaPasada = new RutaPasada();
    rutaPasada.nombre = 'Ruta Alfajor Standard';

    await em.persist([usuario, linea, articulo, etapa, rutaPasada]).flush();

    // Create Pasada
    const pasada = new Pasada();
    pasada.lineaProduccion = linea;
    pasada.rutaPasada = rutaPasada;
    pasada.articulo = articulo;
    pasada.usuario = usuario;
    pasada.numero = 1;
    pasada.estado = PasadaEstado.EN_CURSO;
    pasada.horaInicio = new Date();

    await em.persist(pasada).flush();

    // Create Muestra
    const muestra = new Muestra();
    muestra.pasada = pasada;
    muestra.usuario = usuario;
    muestra.rutaPasada = rutaPasada;
    muestra.articulo = articulo;
    muestra.etapa = etapa;
    muestra.lineaProduccion = linea;
    muestra.pesoNeto = 85.1236; // 4 decimals, should round to 85.124
    muestra.estadoValidacion = MuestraEstadoValidacion.OK;
    muestra.timestamp = new Date();

    await em.persist(muestra).flush();

    em.clear();

    const retrievedPasada = await em.findOne(Pasada, pasada.id, { populate: ['lineaProduccion', 'articulo', 'usuario'] });
    expect(retrievedPasada).not.toBeNull();
    expect(retrievedPasada!.estado).toBe(PasadaEstado.EN_CURSO);
    expect(retrievedPasada!.numero).toBe(1);
    expect(retrievedPasada!.lineaProduccion.nombre).toBe('Línea de Envasado 1');
    expect(retrievedPasada!.articulo!.nombre).toBe('Alfajor Triple');
    expect(retrievedPasada!.usuario.nombreApellido).toBe('Test Operario');

    const retrievedMuestra = await em.findOne(Muestra, muestra.id, { populate: ['pasada', 'etapa'] });
    expect(retrievedMuestra).not.toBeNull();
    expect(retrievedMuestra!.estadoValidacion).toBe(MuestraEstadoValidacion.OK);

    const serialized = wrap(retrievedMuestra!).toJSON();
    expect(serialized.pesoNeto).toBe(85.124);
  });

  it('should support a nullable string marca on Articulo', async () => {
    const em = orm.em.fork();

    const articuloSinMarca = new Articulo();
    articuloSinMarca.nombre = 'Alfajor Sin Marca';
    articuloSinMarca.marca = undefined;

    const articuloConMarca = new Articulo();
    articuloConMarca.nombre = 'Alfajor Con Marca';
    articuloConMarca.marca = 'Havanna';

    await em.persist([articuloSinMarca, articuloConMarca]).flush();
    em.clear();

    const retrievedSin = await em.findOne(Articulo, { nombre: 'Alfajor Sin Marca' });
    expect(retrievedSin).not.toBeNull();
    expect(retrievedSin!.marca).toBeNull();

    const retrievedCon = await em.findOne(Articulo, { nombre: 'Alfajor Con Marca' });
    expect(retrievedCon).not.toBeNull();
    expect(retrievedCon!.marca).toBe('Havanna');
  });
});
