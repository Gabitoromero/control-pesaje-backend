import { MikroORM, SchemaGenerator } from '@mikro-orm/postgresql';
import config from '../mikro-orm.config.js';
import { Usuario, UsuarioRol } from './models/Usuario.js';
import { LineaProduccion } from './models/LineaProduccion.js';
import { Etapa } from './models/Etapa.js';
import { RutaPasada } from './models/RutaPasada.js';
import { Articulo } from './models/Articulo.js';
import { ArticuloRutaPasada } from './models/ArticuloRutaPasada.js';
import { RutaPasadaEtapa } from './models/RutaPasadaEtapa.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
  console.log('[seed]: Starting database seeding...');
  const orm = await MikroORM.init({
    ...config,
    extensions: [SchemaGenerator],
  });
  
  try {
    const generator = orm.schema;
    console.log('[seed]: Dropping existing schema...');
    await generator.drop();
    console.log('[seed]: Creating new schema...');
    await generator.create();

    const em = orm.em.fork();

    // 1. Create Users
    console.log('[seed]: Creating users...');
    const saltRounds = 10;
    const adminPinHash = await bcrypt.hash('0000', saltRounds);
    const jefePinHash = await bcrypt.hash('1111', saltRounds);

    const admin = em.create(Usuario, {
      nombreApellido: 'Admin Local',
      nombreUsuario: 'admin',
      legajo: '0000',
      pinHash: adminPinHash,
      rol: UsuarioRol.ADMINISTRADOR,
      puedeTomarMuestrasLibres: true,
      activo: true,
    });

    const jefe = em.create(Usuario, {
      nombreApellido: 'Jefe de Planta',
      nombreUsuario: 'jefe',
      legajo: '1111',
      pinHash: jefePinHash,
      rol: UsuarioRol.JEFE,
      puedeTomarMuestrasLibres: true,
      activo: true,
    });

    // 3 operarios with PINs
    const pin1Hash = await bcrypt.hash('3333', saltRounds);
    const pin2Hash = await bcrypt.hash('4444', saltRounds);
    const pin3Hash = await bcrypt.hash('5555', saltRounds);

    const operario1 = em.create(Usuario, {
      nombreApellido: 'Lionel Andres Messi',
      nombreUsuario: 'operario1',
      legajo: '3333',
      pinHash: pin1Hash,
      rol: UsuarioRol.OPERARIO,
      puedeTomarMuestrasLibres: false,
      activo: true,
      datosAdicionales: null,
    });

    const operario2 = em.create(Usuario, {
      nombreApellido: 'Angel Di Maria',
      nombreUsuario: 'operario2',
      legajo: '4444',
      pinHash: pin2Hash,
      rol: UsuarioRol.OPERARIO,
      puedeTomarMuestrasLibres: false,
      activo: true,
      datosAdicionales: null,
    });

    const operario3 = em.create(Usuario, {
      nombreApellido: 'Sergio Agüero',
      nombreUsuario: 'operario3',
      legajo: '5555',
      pinHash: pin3Hash,
      rol: UsuarioRol.OPERARIO,
      puedeTomarMuestrasLibres: true,
      activo: true,
      datosAdicionales: null,
    });

    // 2. Create Etapas
    console.log('[seed]: Creating stages...');
    const etapaEnvasado = em.create(Etapa, {
      nombre: 'Envasado',
      descripcion: 'Etapa de envasado primario del producto',
      activo: true,
    });

    const etapaControlPeso = em.create(Etapa, {
      nombre: 'Control Peso',
      descripcion: 'Verificación de peso neto en balanza de precisión',
      activo: true,
    });

    const etapaDetectorMetales = em.create(Etapa, {
      nombre: 'Detector Metales',
      descripcion: 'Control de contaminantes metálicos',
      activo: true,
    });

    const etapaEmbalaje = em.create(Etapa, {
      nombre: 'Embalaje',
      descripcion: 'Embalaje secundario en cajas master',
      activo: true,
    });

    // 3. Create Articulos
    console.log('[seed]: Creating articles...');
    const articuloBombonSuizo = em.create(Articulo, {
      nombre: 'Bombón Suizo',
      descripcion: 'Helado individual bañado en chocolate con crocante',
      marca: 'Montevideana',
      activo: true,
    });

    const articuloPotePremium = em.create(Articulo, {
      nombre: 'Pote Premium Chocolate Shock',
      descripcion: 'Pote de helado familiar sabor chocolate intenso con chips',
      marca: 'Montevideana',
      activo: true,
    });

    const articuloConoDoret = em.create(Articulo, {
      nombre: 'Cono Doret Dulce de Leche',
      descripcion: 'Cono de helado relleno con dulce de leche repostero',
      marca: 'Com Com',
      activo: true,
    });

    const articuloFlan = em.create(Articulo, {
      nombre: 'Midi Súper Flan',
      descripcion: 'Flan individual con caramelo líquido',
      marca: 'Com Com',
      activo: true,
    });

    const articuloPostreAlfajor = em.create(Articulo, {
      nombre: 'Postre Helado Alfajor',
      descripcion: 'Postre helado con tapitas sabor alfajor y relleno de crema dulce',
      marca: 'Fantoche',
      activo: true,
    });

    // 4. Create Rutas
    console.log('[seed]: Creating routes...');
    const rutaPostresChicos = em.create(RutaPasada, {
      nombre: 'Ruta Control Postres Individuales',
      descripcion: 'Ruta estándar para control de calidad de productos individuales de 70g',
      activo: true,
    });

    const rutaPostresFamiliares = em.create(RutaPasada, {
      nombre: 'Ruta Control Postres Familiares y Flanes',
      descripcion: 'Ruta estándar para potes familiares y flanes de 250g',
      activo: true,
    });

    // 5. Create RutaPasadaEtapa (Weighing limits and ordering)
    console.log('[seed]: Linking stages to routes...');
    // Route 1 limits (Individuales: peso ideal 70g, min 65g, max 75g, 3/5/2 samples)
    em.create(RutaPasadaEtapa, {
      rutaPasada: rutaPostresChicos,
      etapa: etapaEnvasado,
      orden: 1,
      pesoIdeal: 70.000,
      pesoMinimo: 65.000,
      pesoMaximo: 75.000,
      cantidadMuestrasRequeridas: 3,
      activo: true,
    });

    em.create(RutaPasadaEtapa, {
      rutaPasada: rutaPostresChicos,
      etapa: etapaControlPeso,
      orden: 2,
      pesoIdeal: 70.000,
      pesoMinimo: 67.000,
      pesoMaximo: 73.000,
      cantidadMuestrasRequeridas: 5,
      activo: true,
    });

    em.create(RutaPasadaEtapa, {
      rutaPasada: rutaPostresChicos,
      etapa: etapaDetectorMetales,
      orden: 3,
      pesoIdeal: 70.000,
      pesoMinimo: 60.000,
      pesoMaximo: 80.000,
      cantidadMuestrasRequeridas: 2,
      activo: true,
    });

    // Route 2 limits (Familiares: peso ideal 250g, min 235g, max 265g, 3/4/2 samples)
    em.create(RutaPasadaEtapa, {
      rutaPasada: rutaPostresFamiliares,
      etapa: etapaEnvasado,
      orden: 1,
      pesoIdeal: 250.000,
      pesoMinimo: 235.000,
      pesoMaximo: 265.000,
      cantidadMuestrasRequeridas: 3,
      activo: true,
    });

    em.create(RutaPasadaEtapa, {
      rutaPasada: rutaPostresFamiliares,
      etapa: etapaControlPeso,
      orden: 2,
      pesoIdeal: 250.000,
      pesoMinimo: 240.000,
      pesoMaximo: 260.000,
      cantidadMuestrasRequeridas: 4,
      activo: true,
    });

    em.create(RutaPasadaEtapa, {
      rutaPasada: rutaPostresFamiliares,
      etapa: etapaEmbalaje,
      orden: 3,
      pesoIdeal: 250.000,
      pesoMinimo: 220.000,
      pesoMaximo: 280.000,
      cantidadMuestrasRequeridas: 2,
      activo: true,
    });

    // 6. Link Articles to Routes (ArticuloRutaPasada)
    console.log('[seed]: Linking articles to routes...');
    // Link 70g items to rutaPostresChicos
    em.create(ArticuloRutaPasada, {
      articulo: articuloBombonSuizo,
      rutaPasada: rutaPostresChicos,
      activo: true,
    });

    em.create(ArticuloRutaPasada, {
      articulo: articuloConoDoret,
      rutaPasada: rutaPostresChicos,
      activo: true,
    });

    em.create(ArticuloRutaPasada, {
      articulo: articuloPostreAlfajor,
      rutaPasada: rutaPostresChicos,
      activo: true,
    });

    // Link 250g items to rutaPostresFamiliares
    em.create(ArticuloRutaPasada, {
      articulo: articuloPotePremium,
      rutaPasada: rutaPostresFamiliares,
      activo: true,
    });

    em.create(ArticuloRutaPasada, {
      articulo: articuloFlan,
      rutaPasada: rutaPostresFamiliares,
      activo: true,
    });

    // 7. Create LineasProduccion
    console.log('[seed]: Creating production lines...');
    em.create(LineaProduccion, {
      nombre: 'Línea de Envasado Rápido A',
      numeroBalanza: 1,
      rutaPasadaActiva: rutaPostresChicos,
      activo: true,
    });

    em.create(LineaProduccion, {
      nombre: 'Línea de Envasado Pepas B',
      numeroBalanza: 2,
      rutaPasadaActiva: rutaPostresFamiliares,
      activo: true,
    });

    em.create(LineaProduccion, {
      nombre: 'Línea Auxiliar Multipropósito C',
      numeroBalanza: 3,
      rutaPasadaActiva: undefined,
      activo: true,
    });

    console.log('[seed]: Persisting seed to database...');
    await em.flush();
    console.log('[seed]: Database seeded successfully!');
  } catch (error) {
    console.error('[seed]: Error seeding database', error);
  } finally {
    await orm.close();
  }
}

run();
