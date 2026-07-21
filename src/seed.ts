import { MikroORM, SchemaGenerator } from '@mikro-orm/postgresql';
import config from '../mikro-orm.config.js';
import { Usuario, UsuarioRol } from './models/Usuario.js';
import { LineaProduccion } from './models/LineaProduccion.js';
import { Etapa } from './models/Etapa.js';
import { RutaPasada } from './models/RutaPasada.js';
import { Articulo } from './models/Articulo.js';
import { ArticuloRutaPasada } from './models/ArticuloRutaPasada.js';
import { RutaPasadaEtapa } from './models/RutaPasadaEtapa.js';
import { Dispositivo } from './models/Dispositivo.js';
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
      esSistema: true,
    });

    const jefe = em.create(Usuario, {
      nombreApellido: 'Jefe de Planta',
      nombreUsuario: 'jefe',
      legajo: '1111',
      pinHash: jefePinHash,
      rol: UsuarioRol.JEFE,
      puedeTomarMuestrasLibres: true,
      activo: true,
      esSistema: false,
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
      puedeTomarMuestrasLibres: true,
      activo: true,
      esSistema: false,
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
      esSistema: false,
      datosAdicionales: null,
    });

    const operario3 = em.create(Usuario, {
      nombreApellido: 'Sergio Agüero',
      nombreUsuario: 'operario3',
      legajo: '5555',
      pinHash: pin3Hash,
      rol: UsuarioRol.OPERARIO,
      puedeTomarMuestrasLibres: false,
      activo: true,
      esSistema: false,
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
      descripcion: 'Medicion de peso neto en balanza de precisión',
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

    const etapaControlPeso5g = em.create(Etapa, {
      nombre: 'Control Peso 5g',
      descripcion: 'Calibración de balanzas con peso neto en balanza de precisión',
      activo: true,
    });

    const etapaControlPeso10g = em.create(Etapa, {
      nombre: 'Control Peso 10g',
      descripcion: 'Calibración de balanzas con peso neto en balanza de precisión',
      activo: true,
    });

    const etapaControlPeso20g = em.create(Etapa, {
      nombre: 'Control Peso 20g',
      descripcion: 'Calibración de balanzas con peso neto en balanza de precisión',
      activo: true,
    });

    const etapaControlPeso30g = em.create(Etapa, {
      nombre: 'Control Peso 30g',
      descripcion: 'Calibración de balanzas con peso neto en balanza de precisión',
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

    const articuloPesaFija = em.create(Articulo, {
      nombre: 'Pesa fija de calibración',
      descripcion: 'Pesa fija utilizada para calibrar balanzas',
      activo: false,
    });

    // 4. Create Rutas
    console.log('[seed]: Creating routes...');
    const rutaPostresChicos = em.create(RutaPasada, {
      nombre: 'Ruta Postres Individuales',
      descripcion: 'Ruta estándar para control de calidad de productos individuales de 70g',
      activo: true,
    });

    const rutaPostresFamiliares = em.create(RutaPasada, {
      nombre: 'Ruta Postres Familiares y Flanes',
      descripcion: 'Ruta estándar para potes familiares y flanes de 250g',
      activo: true,
    });

    const rutaPesoFijo = em.create(RutaPasada, {
      nombre: 'Ruta Calibracion',
      descripcion: 'Ruta de calibración de balanzas con pesas fijas',
      activo: true,
    });

    // 5. Create RutaPasadaEtapa (Weighing limits and ordering)
    console.log('[seed]: Linking stages to routes...');
    // Route 1 limits (Individuales: peso ideal 70g, min 65g, max 75g, 3/5/2 samples)
    em.create(RutaPasadaEtapa, {
      rutaPasada: rutaPostresChicos,
      etapa: etapaEnvasado,
      orden: 1,
      pesoIdeal: 0.700,
      pesoMinimo: 0.650,
      pesoMaximo: 0.750,
      cantidadMuestrasRequeridas: 3,
    });

    em.create(RutaPasadaEtapa, {
      rutaPasada: rutaPostresChicos,
      etapa: etapaControlPeso,
      orden: 2,
      pesoIdeal: 0.700,
      pesoMinimo: 0.670,
      pesoMaximo: 0.730,
      cantidadMuestrasRequeridas: 5,
    });

    em.create(RutaPasadaEtapa, {
      rutaPasada: rutaPostresChicos,
      etapa: etapaDetectorMetales,
      orden: 3,
      pesoIdeal: 0.700,
      pesoMinimo: 0.600,
      pesoMaximo: 0.800,
      cantidadMuestrasRequeridas: 2,
    });

    // Route 2 limits (Familiares: peso ideal 250g, min 235g, max 265g, 3/4/2 samples)
    em.create(RutaPasadaEtapa, {
      rutaPasada: rutaPostresFamiliares,
      etapa: etapaEnvasado,
      orden: 1,
      pesoIdeal: 0.250,
      pesoMinimo: 0.235,
      pesoMaximo: 0.265,
      cantidadMuestrasRequeridas: 3,
    });

    em.create(RutaPasadaEtapa, {
      rutaPasada: rutaPostresFamiliares,
      etapa: etapaControlPeso,
      orden: 2,
      pesoIdeal: 0.250,
      pesoMinimo: 0.240,
      pesoMaximo: 0.260,
      cantidadMuestrasRequeridas: 4,
    });

    em.create(RutaPasadaEtapa, {
      rutaPasada: rutaPostresFamiliares,
      etapa: etapaEmbalaje,
      orden: 3,
      pesoIdeal: 0.250,
      pesoMinimo: 0.220,
      pesoMaximo: 0.280,
      cantidadMuestrasRequeridas: 2,
    });

    em.create(RutaPasadaEtapa, {
      rutaPasada: rutaPesoFijo,
      etapa: etapaControlPeso5g,
      orden: 1,
      pesoIdeal: 0.005,
      pesoMinimo: 0.004,
      pesoMaximo: 0.006,
      cantidadMuestrasRequeridas: 5,
    });

      em.create(RutaPasadaEtapa, {
      rutaPasada: rutaPesoFijo,
      etapa: etapaControlPeso10g,
      orden: 2,
      pesoIdeal: 0.010,
      pesoMinimo: 0.009,
      pesoMaximo: 0.011,
      cantidadMuestrasRequeridas: 5,
    });

    em.create(RutaPasadaEtapa, {
      rutaPasada: rutaPesoFijo,
      etapa: etapaControlPeso20g,
      orden: 3,
      pesoIdeal: 0.020,
      pesoMinimo: 0.019,
      pesoMaximo: 0.021,
      cantidadMuestrasRequeridas: 5,
    });

    em.create(RutaPasadaEtapa, {
      rutaPasada: rutaPesoFijo,
      etapa: etapaControlPeso30g,
      orden: 4,
      pesoIdeal: 0.030,
      pesoMinimo: 0.029,
      pesoMaximo: 0.031,
      cantidadMuestrasRequeridas: 5,
    });


    // 6. Link Articles to Routes (ArticuloRutaPasada)
    console.log('[seed]: Linking articles to routes...');
    // Link 70g items to rutaPostresChicos
    em.create(ArticuloRutaPasada, {
      articulo: articuloBombonSuizo,
      rutaPasada: rutaPostresChicos,
    });

    em.create(ArticuloRutaPasada, {
      articulo: articuloConoDoret,
      rutaPasada: rutaPostresChicos,
    });

    em.create(ArticuloRutaPasada, {
      articulo: articuloPostreAlfajor,
      rutaPasada: rutaPostresChicos,
    });

    // Link 250g items to rutaPostresFamiliares
    em.create(ArticuloRutaPasada, {
      articulo: articuloPotePremium,
      rutaPasada: rutaPostresFamiliares,
    });

    em.create(ArticuloRutaPasada, {
      articulo: articuloFlan,
      rutaPasada: rutaPostresFamiliares,
    });

    em.create(ArticuloRutaPasada, {
      articulo: articuloPesaFija,
      rutaPasada: rutaPesoFijo,
    });


    // 7. Create LineasProduccion
    console.log('[seed]: Creating production lines...');
    const lineaA = em.create(LineaProduccion, {
      nombre: 'Línea A',
      rutaPasadaActiva: rutaPostresChicos,
      activo: true,
      rutaAsignadaAt: new Date(),
    });

    em.create(LineaProduccion, {
      nombre: 'Línea B',
      rutaPasadaActiva: rutaPostresFamiliares,
      activo: true,
      rutaAsignadaAt: new Date(),
    });

    em.create(LineaProduccion, {
      nombre: 'Línea C',
      rutaPasadaActiva: undefined,
      activo: true,
      rutaAsignadaAt: new Date(),
    });

    // 8. Create Dispositivos (persistent hardware registry) — demoable
    // without a live device connection: the paired one shows as
    // 'Desconectado' (no live socket), the unpaired one has no línea nombre.
    console.log('[seed]: Creating dispositivos...');
    em.create(Dispositivo, {
      hardwareId: 'rpi-linea-a-001',
      nombre: 'Pi-2',
      lineaProduccion: lineaA,
      ultimaConexionAt: new Date(),
    });

    em.create(Dispositivo, {
      hardwareId: 'rpi-unassigned-002',
      nombre: 'Pi-3',
      lineaProduccion: undefined,
      ultimaConexionAt: null,
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
