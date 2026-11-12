import { EntityManager } from '@mikro-orm/core';
import exceljs from 'exceljs';
import { Muestra, MuestraEstadoValidacion } from '../models/Muestra.js';
import { Pasada, PasadaEstado } from '../models/Pasada.js';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { RutaPasada } from '../models/RutaPasada.js';
import { ArticuloRutaPasada } from '../models/ArticuloRutaPasada.js';
import { RutaPasadaEtapa } from '../models/RutaPasadaEtapa.js';
import { PESO_DECIMALS } from '../shared/constants.js';
import { unidadLabel } from '../shared/peso.js';
import type { Magnitud } from '../shared/types/domain.js';

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
const boolLabel = (b: boolean): 'Sí' | 'No' => (b ? 'Sí' : 'No');
// Shown in the pasadas sheet for a "línea parada" pasada that has no samples.
const SIN_MUESTRAS = 'sin muestras';
const PESO_NUMFMT = `0.${'0'.repeat(PESO_DECIMALS)}`;
const SHEET_NAME_MAX = 31;

function formatDateTime(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const cleanSheetName = (nombre: string): string =>
  nombre.replace(/[/\\?*[\]:]/g, '').replace(/^'+|'+$/g, '').trim();

// Truncates `base` so that `base + suffix` fits the 31-character limit of an Excel sheet name.
const fitSheetName = (base: string, suffix = ''): string =>
  `${base.substring(0, Math.max(SHEET_NAME_MAX - suffix.length, 0)).trimEnd()}${suffix}`;

/**
 * One sheet name per line: the line's own name. Excel compares sheet names case-insensitively and two lines can
 * share a name (or a 31-character prefix), so only the lines that would collide get their id appended.
 */
const assignLineSheetNames = (lineas: ReadonlyArray<{ id: number; nombre: string }>): Map<number, string> => {
  const clean = new Map(lineas.map((l) => [l.id, cleanSheetName(l.nombre) || `Línea ${l.id}`]));
  const plain = (id: number) => fitSheetName(clean.get(id)!).toLowerCase();

  const counts = new Map<string, number>();
  for (const l of lineas) counts.set(plain(l.id), (counts.get(plain(l.id)) ?? 0) + 1);

  const used = new Set<string>();
  const names = new Map<number, string>();
  for (const l of lineas) {
    const base = clean.get(l.id)!;
    let name = (counts.get(plain(l.id)) ?? 0) > 1 ? fitSheetName(base, ` ${l.id}`) : fitSheetName(base);
    // Last resort: a plain name can equal another line's "name id".
    for (let n = 2; used.has(name.toLowerCase()); n++) name = fitSheetName(base, ` ${l.id}-${n}`);
    used.add(name.toLowerCase());
    names.set(l.id, name);
  }
  return names;
};

/** Unit of a reported value: weights are stored in kg, and a volumen etapa reads them as L (1 kg = 1 L, no conversion). */
const unidadReporte = (magnitud?: Magnitud): string => unidadLabel('kg', magnitud);

type MagnitudLookup = (rutaId: number | undefined, etapaId: number | undefined) => Magnitud | undefined;

/**
 * Magnitud of each ruta-etapa as configured today. Muestras do not snapshot it, so a report labels past
 * samples with the current configuration; an etapa no longer in its ruta falls back to peso.
 */
async function loadMagnitudes(em: EntityManager, rutaIds: Iterable<number | undefined>): Promise<MagnitudLookup> {
  const ids = [...new Set([...rutaIds].filter((id): id is number => id !== undefined))];
  const byKey = new Map<string, Magnitud | undefined>();
  if (ids.length > 0) {
    const rutaEtapas = await em.find(RutaPasadaEtapa, { rutaPasada: { $in: ids } });
    for (const re of rutaEtapas) byKey.set(`${re.rutaPasada.id}:${re.etapa.id}`, re.magnitud);
  }
  return (rutaId, etapaId) => byKey.get(`${rutaId}:${etapaId}`);
}

function addSinDatosSheet(workbook: exceljs.Workbook): void {
  const sheet = workbook.addWorksheet('Sin datos');
  sheet.getCell('A1').value = 'Sin datos para el rango seleccionado';
}

export const reporteService = {
  /** Muestras report: a single sheet with every muestra of the range (the line is a column). */
  async generateReporteMuestras(em: EntityManager, desde: Date, hasta: Date): Promise<exceljs.Workbook> {
    const muestras = await em.find(
      Muestra,
      { timestamp: { $gte: desde, $lte: hasta } },
      {
        populate: [
          'pasada', 'pasada.articulo', 'pasada.balanza', 'etapa', 'rutaPasada', 'lineaProduccion', 'usuario'
        ] as const,
        orderBy: { timestamp: 'asc' }
      }
    );

    const workbook = new exceljs.Workbook();

    if (muestras.length === 0) {
      addSinDatosSheet(workbook);
      return workbook;
    }

    const magnitudDe = await loadMagnitudes(em, muestras.map((m) => m.rutaPasada.id));

    const sheet = workbook.addWorksheet('Muestras');
    sheet.columns = [
      { header: 'Línea de Producción', key: 'linea', width: 20 },
      { header: 'Balanza', key: 'balanza', width: 20 },
      { header: 'Ruta', key: 'ruta', width: 20 },
      { header: 'N° Pasada', key: 'pasadaNum', width: 15 },
      { header: 'Estado Pasada', key: 'pasadaEst', width: 15 },
      { header: 'Código', key: 'articuloCodigo', width: 18 },
      { header: 'Artículo', key: 'articulo', width: 20 },
      { header: 'Etapa', key: 'etapa', width: 20 },
      { header: 'Fecha/Hora Muestra', key: 'fechaHora', width: 20 },
      { header: 'Neto', key: 'peso', width: 15 },
      { header: 'Límite Mín', key: 'limiteMin', width: 15 },
      { header: 'Ideal', key: 'pesoIdeal', width: 15 },
      { header: 'Límite Máx', key: 'limiteMax', width: 15 },
      { header: 'Unidad', key: 'unidad', width: 10 },
      { header: 'Validación', key: 'validacion', width: 15 },
      { header: 'Observación Muestra', key: 'obs', width: 30 },
      { header: 'Operario', key: 'operario', width: 20 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const m of muestras) {
      const row = sheet.addRow({
        linea: m.lineaProduccion.nombre,
        balanza: m.pasada?.balanza?.nombre ?? '-',
        ruta: m.rutaPasada.nombre,
        pasadaNum: m.pasada?.numero ?? '-',
        pasadaEst: m.pasada?.estado ?? '-',
        articuloCodigo: m.pasada?.articulo?.codigo ?? '-',
        articulo: m.pasada?.articulo?.nombre ?? '-',
        etapa: m.etapa.nombre,
        fechaHora: formatDateTime(m.timestamp),
        peso: Number(m.pesoNeto),
        limiteMin: m.pesoMinimo !== undefined ? Number(m.pesoMinimo) : '-',
        pesoIdeal: m.pesoIdeal !== undefined ? Number(m.pesoIdeal) : '-',
        limiteMax: m.pesoMaximo !== undefined ? Number(m.pesoMaximo) : '-',
        unidad: unidadReporte(magnitudDe(m.rutaPasada.id, m.etapa.id)),
        validacion: m.estadoValidacion === MuestraEstadoValidacion.OK ? 'ok' : 'fuera de rango',
        obs: m.observacion ?? '-',
        operario: m.usuario.nombreApellido,
      });

      if (!m.pasada) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
        });
      }

      const valCell = row.getCell('validacion');
      if (m.estadoValidacion === MuestraEstadoValidacion.OK) {
        valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } };
      } else {
        valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } };
      }
    }

    return workbook;
  },

  /**
   * Pasadas report: one sheet per production line that had pasadas in the range, named after the line. Each row is one etapa of one
   * pasada, and the pasada's own fields repeat on every row of its etapas (a pasada without muestras keeps a
   * single row with '-' in the etapa columns).
   */
  async generateReportePasadas(em: EntityManager, desde: Date, hasta: Date): Promise<exceljs.Workbook> {
    const muestras = await em.find(
      Muestra,
      { timestamp: { $gte: desde, $lte: hasta } },
      { populate: ['pasada', 'etapa'] as const, orderBy: { timestamp: 'asc' } }
    );

    const pasadas = await em.find(
      Pasada,
      { horaInicio: { $gte: desde, $lte: hasta }, activo: true },
      {
        populate: ['lineaProduccion', 'rutaPasada', 'articulo', 'usuario', 'balanza'] as const,
        orderBy: { horaInicio: 'asc' }
      }
    );

    const muestrasPorPasada = new Map<number, Muestra[]>();
    for (const m of muestras) {
      if (!m.pasada) continue;
      const list = muestrasPorPasada.get(m.pasada.id) ?? [];
      list.push(m);
      muestrasPorPasada.set(m.pasada.id, list);
    }

    const lineasMap = new Map<number, { linea: LineaProduccion, pasadas: Pasada[] }>();
    for (const p of pasadas) {
      if (!lineasMap.has(p.lineaProduccion.id)) {
        lineasMap.set(p.lineaProduccion.id, { linea: p.lineaProduccion, pasadas: [] });
      }
      lineasMap.get(p.lineaProduccion.id)!.pasadas.push(p);
    }

    const lineas = Array.from(lineasMap.values()).sort(
      (a, b) => a.linea.nombre.localeCompare(b.linea.nombre) || a.linea.id - b.linea.id
    );

    const workbook = new exceljs.Workbook();

    if (lineas.length === 0) {
      addSinDatosSheet(workbook);
      return workbook;
    }

    const sheetNames = assignLineSheetNames(lineas.map((g) => g.linea));
    const magnitudDe = await loadMagnitudes(em, pasadas.map((p) => p.rutaPasada.id));

    for (const grupo of lineas) {
      const sheet = workbook.addWorksheet(sheetNames.get(grupo.linea.id)!);
      sheet.columns = [
        { header: 'Línea de Producción', key: 'linea', width: 20 },
        { header: 'Balanza', key: 'balanza', width: 20 },
        { header: 'Ruta', key: 'ruta', width: 20 },
        { header: 'N° Pasada', key: 'pasadaNum', width: 15 },
        { header: 'Observación Pasada', key: 'observacionInicio', width: 30 },
        { header: 'Código', key: 'articuloCodigo', width: 18 },
        { header: 'Artículo', key: 'articulo', width: 20 },
        { header: 'Estado Pasada', key: 'estado', width: 15 },
        { header: 'Inicio', key: 'inicio', width: 20 },
        { header: 'Cierre', key: 'cierre', width: 20 },
        { header: 'Duración (min)', key: 'duracion', width: 15 },
        { header: 'Responsable', key: 'responsable', width: 20 },
        { header: 'Total Muestras Pasada', key: 'total', width: 15 },
        { header: 'Conformes Pasada', key: 'conformes', width: 15 },
        { header: 'Fuera de Rango Pasada', key: 'fuera', width: 15 },
        { header: '% Conforme Pasada', key: 'porc', width: 15 },
        { header: 'Motivo de Cierre', key: 'motivo', width: 20 },
        { header: 'Observación Cierre', key: 'obs', width: 30 },
        { header: 'Etapa', key: 'etapa', width: 20 },
        { header: 'Total Muestras Etapa', key: 'totalEtapa', width: 15 },
        { header: 'Promedio Neto Etapa', key: 'promedioEtapa', width: 20 },
        { header: 'Unidad', key: 'unidad', width: 10 },
      ];
      sheet.getRow(1).font = { bold: true };

      for (const p of grupo.pasadas) {
        const pm = muestrasPorPasada.get(p.id) ?? [];
        const total = pm.length;
        const ok = pm.filter(m => m.estadoValidacion === MuestraEstadoValidacion.OK).length;
        const outside = total - ok;
        const sinMuestras = p.estado === PasadaEstado.PARADA && total === 0;
        const pct = sinMuestras ? SIN_MUESTRAS : total > 0 ? ((ok / total) * 100).toFixed(1) : "0.0";
        let duracion: number | string = '-';
        if (p.horaCierre) {
          duracion = Math.round((p.horaCierre.getTime() - p.horaInicio.getTime()) / 60000);
        }

        // The pasada's own fields, repeated on every row of its etapas.
        const pasadaFields = {
          linea: p.lineaProduccion.nombre,
          balanza: p.balanza?.nombre ?? '-',
          ruta: p.rutaPasada.nombre,
          pasadaNum: p.numero,
          observacionInicio: p.observacion ?? '-',
          articuloCodigo: p.articulo?.codigo ?? '-',
          articulo: p.articulo?.nombre ?? '-',
          estado: p.estado,
          inicio: formatDateTime(p.horaInicio),
          cierre: p.horaCierre ? formatDateTime(p.horaCierre) : '-',
          duracion: duracion,
          responsable: p.usuario.nombreApellido,
          total: sinMuestras ? SIN_MUESTRAS : total,
          conformes: sinMuestras ? SIN_MUESTRAS : ok,
          fuera: sinMuestras ? SIN_MUESTRAS : outside,
          porc: pct,
          motivo: p.motivoCierre ?? '-',
          obs: p.observacionCierre ?? '-',
        };

        const pesosPorEtapa = new Map<string, { etapaId: number | undefined; pesos: number[] }>();
        for (const m of pm) {
          if (!pesosPorEtapa.has(m.etapa.nombre)) pesosPorEtapa.set(m.etapa.nombre, { etapaId: m.etapa.id, pesos: [] });
          pesosPorEtapa.get(m.etapa.nombre)!.pesos.push(Number(m.pesoNeto));
        }

        if (pesosPorEtapa.size === 0) {
          sheet.addRow({ ...pasadaFields, etapa: '-', totalEtapa: '-', promedioEtapa: '-', unidad: '-' });
          continue;
        }

        for (const [etapa, { etapaId, pesos }] of pesosPorEtapa.entries()) {
          const avg = pesos.reduce((acc, v) => acc + v, 0) / pesos.length;
          sheet.addRow({
            ...pasadaFields,
            etapa: etapa,
            totalEtapa: pesos.length,
            promedioEtapa: avg.toFixed(PESO_DECIMALS),
            unidad: unidadReporte(magnitudDe(p.rutaPasada.id, etapaId)),
          });
        }
      }
    }

    return workbook;
  },
  async generateReporteRutasPasada(em: EntityManager): Promise<exceljs.Workbook> {
    const rutas = await em.find(
      RutaPasada,
      {},
      { populate: ['etapas', 'etapas.etapa'] as const, orderBy: { nombre: 'asc' } }
    );
    const asignaciones = await em.find(ArticuloRutaPasada, {}, { populate: ['articulo'] as const });

    const sortedRutas = [...rutas].sort((a, b) => collator.compare(a.nombre, b.nombre) || a.id - b.id);

    const articulosPorRuta = new Map<number, ArticuloRutaPasada['articulo'][]>();
    for (const a of asignaciones) {
      const list = articulosPorRuta.get(a.rutaPasada.id) ?? [];
      list.push(a.articulo);
      articulosPorRuta.set(a.rutaPasada.id, list);
    }

    const workbook = new exceljs.Workbook();

    const rutasSheet = workbook.addWorksheet('Rutas y etapas');
    rutasSheet.columns = [
      { header: 'ID Ruta', key: 'ruta_id', width: 10 },
      { header: 'Ruta', key: 'ruta_nombre', width: 25 },
      { header: 'Descripción Ruta', key: 'ruta_descripcion', width: 30 },
      { header: 'Ruta Activa', key: 'ruta_activa', width: 12 },
      { header: 'ID Ruta-Etapa', key: 'ruta_etapa_id', width: 14 },
      { header: 'Orden', key: 'orden', width: 8 },
      { header: 'ID Etapa', key: 'etapa_id', width: 10 },
      { header: 'Etapa', key: 'etapa_nombre', width: 25 },
      { header: 'Descripción Etapa', key: 'etapa_descripcion', width: 30 },
      { header: 'Etapa Activa', key: 'etapa_activa', width: 12 },
      { header: 'Ideal', key: 'peso_ideal', width: 16 },
      { header: 'Mínimo', key: 'peso_minimo', width: 16 },
      { header: 'Máximo', key: 'peso_maximo', width: 16 },
      { header: 'Unidad', key: 'unidad', width: 10 },
      { header: 'Muestras Requeridas', key: 'cantidad_muestras_requeridas', width: 20 },
    ];
    rutasSheet.getRow(1).font = { bold: true };
    rutasSheet.views = [{ state: 'frozen', ySplit: 1 }];

    for (const ruta of sortedRutas) {
      const rutaCells = {
        ruta_id: ruta.id,
        ruta_nombre: ruta.nombre,
        ruta_descripcion: ruta.descripcion ?? null,
        ruta_activa: boolLabel(ruta.activo),
      };
      const etapas = [...ruta.etapas].sort((a, b) => a.orden - b.orden || a.id - b.id);

      if (etapas.length === 0) {
        rutasSheet.addRow({
          ...rutaCells,
          ruta_etapa_id: null,
          orden: null,
          etapa_id: null,
          etapa_nombre: null,
          etapa_descripcion: null,
          etapa_activa: null,
          peso_ideal: null,
          peso_minimo: null,
          peso_maximo: null,
          unidad: null,
          cantidad_muestras_requeridas: null,
        });
        continue;
      }

      for (const rpe of etapas) {
        const row = rutasSheet.addRow({
          ...rutaCells,
          ruta_etapa_id: rpe.id,
          orden: rpe.orden,
          etapa_id: rpe.etapa.id,
          etapa_nombre: rpe.etapa.nombre,
          etapa_descripcion: rpe.etapa.descripcion ?? null,
          etapa_activa: boolLabel(rpe.etapa.activo),
          peso_ideal: Number(rpe.pesoIdeal),
          peso_minimo: Number(rpe.pesoMinimo),
          peso_maximo: Number(rpe.pesoMaximo),
          unidad: unidadReporte(rpe.magnitud),
          cantidad_muestras_requeridas: rpe.cantidadMuestrasRequeridas,
        });
        for (const key of ['peso_ideal', 'peso_minimo', 'peso_maximo']) {
          row.getCell(key).numFmt = PESO_NUMFMT;
        }
      }
    }

    const articulosSheet = workbook.addWorksheet('Articulos');
    articulosSheet.columns = [
      { header: 'ID Ruta', key: 'ruta_id', width: 10 },
      { header: 'Ruta', key: 'ruta_nombre', width: 25 },
      { header: 'Ruta Activa', key: 'ruta_activa', width: 12 },
      { header: 'ID Artículo', key: 'articulo_id', width: 12 },
      { header: 'Código', key: 'articulo_codigo', width: 18 },
      { header: 'Artículo', key: 'articulo_nombre', width: 25 },
      { header: 'Descripción Artículo', key: 'articulo_descripcion', width: 30 },
      { header: 'Artículo Activo', key: 'articulo_activo', width: 15 },
    ];
    articulosSheet.getRow(1).font = { bold: true };
    articulosSheet.views = [{ state: 'frozen', ySplit: 1 }];

    for (const ruta of sortedRutas) {
      const rutaCells = {
        ruta_id: ruta.id,
        ruta_nombre: ruta.nombre,
        ruta_activa: boolLabel(ruta.activo),
      };
      const articulos = [...(articulosPorRuta.get(ruta.id) ?? [])].sort(
        (a, b) => collator.compare(a.codigo, b.codigo) || a.id - b.id
      );

      if (articulos.length === 0) {
        articulosSheet.addRow({
          ...rutaCells,
          articulo_id: null,
          articulo_codigo: null,
          articulo_nombre: null,
          articulo_descripcion: null,
          articulo_activo: null,
        });
        continue;
      }

      for (const art of articulos) {
        articulosSheet.addRow({
          ...rutaCells,
          articulo_id: art.id,
          articulo_codigo: art.codigo,
          articulo_nombre: art.nombre ?? null,
          articulo_descripcion: art.descripcion ?? null,
          articulo_activo: boolLabel(art.activo),
        });
      }
    }

    return workbook;
  }
};
