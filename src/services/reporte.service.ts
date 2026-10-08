import { EntityManager } from '@mikro-orm/core';
import exceljs from 'exceljs';
import { Muestra, MuestraEstadoValidacion } from '../models/Muestra.js';
import { Pasada } from '../models/Pasada.js';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { RutaPasada } from '../models/RutaPasada.js';
import { ArticuloRutaPasada } from '../models/ArticuloRutaPasada.js';
import { PESO_DECIMALS } from '../shared/constants.js';

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
const boolLabel = (b: boolean): 'Sí' | 'No' => (b ? 'Sí' : 'No');
const PESO_NUMFMT = `0.${'0'.repeat(PESO_DECIMALS)}`;

function formatDateTime(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const reporteService = {
  async generateReportePasadasMuestras(em: EntityManager, desde: Date, hasta: Date): Promise<exceljs.Workbook> {
    const muestras = await em.find(
      Muestra,
      { timestamp: { $gte: desde, $lte: hasta } },
      {
        populate: ['pasada', 'pasada.articulo', 'pasada.usuario', 'etapa', 'rutaPasada', 'lineaProduccion', 'usuario'] as const,
        orderBy: { timestamp: 'asc' }
      }
    );

    const pasadas = await em.find(
      Pasada,
      { horaInicio: { $gte: desde, $lte: hasta }, activo: true },
      {
        populate: ['lineaProduccion', 'rutaPasada', 'articulo', 'usuario', 'balanza'] as const,
        orderBy: { horaInicio: 'asc' }
      }
    );

    const lineasMap = new Map<number, {
      linea: LineaProduccion,
      muestras: Muestra[],
      pasadas: Pasada[]
    }>();

    for (const p of pasadas) {
      if (!lineasMap.has(p.lineaProduccion.id)) {
        lineasMap.set(p.lineaProduccion.id, { linea: p.lineaProduccion, muestras: [], pasadas: [] });
      }
      lineasMap.get(p.lineaProduccion.id)!.pasadas.push(p);
    }
    for (const m of muestras) {
      if (!lineasMap.has(m.lineaProduccion.id)) {
        lineasMap.set(m.lineaProduccion.id, { linea: m.lineaProduccion, muestras: [], pasadas: [] });
      }
      lineasMap.get(m.lineaProduccion.id)!.muestras.push(m);
    }

    const lineas = Array.from(lineasMap.values()).sort((a, b) => a.linea.nombre.localeCompare(b.linea.nombre));

    const workbook = new exceljs.Workbook();

    if (lineas.length === 0) {
      const sheet = workbook.addWorksheet('Sin datos');
      sheet.getCell('A1').value = 'Sin datos para el rango seleccionado';
    } else {
      for (const grupo of lineas) {
        const lineName = grupo.linea.nombre.replace(/[/\\?*[\]]/g, '');
        const detailSheet = workbook.addWorksheet(`Muestras - ${lineName}`.substring(0, 31));
        
        detailSheet.columns = [
          { header: 'Línea de Producción', key: 'linea', width: 20 },
          { header: 'Ruta', key: 'ruta', width: 20 },
          { header: 'N° Pasada', key: 'pasadaNum', width: 15 },
          { header: 'Estado Pasada', key: 'pasadaEst', width: 15 },
          { header: 'Etapa', key: 'etapa', width: 20 },
          { header: 'Fecha/Hora Muestra', key: 'fechaHora', width: 20 },
          { header: 'Peso Neto (kg)', key: 'peso', width: 15 },
          { header: 'Límite Mín (kg)', key: 'limiteMin', width: 15 },
          { header: 'Peso Ideal (kg)', key: 'pesoIdeal', width: 15 },
          { header: 'Límite Máx (kg)', key: 'limiteMax', width: 15 },
          { header: 'Validación', key: 'validacion', width: 15 },
          { header: 'Observación Muestra', key: 'obs', width: 30 },
          { header: 'Operario', key: 'operario', width: 20 },
        ];
        detailSheet.getRow(1).font = { bold: true };

        for (const m of grupo.muestras) {
          const row = detailSheet.addRow({
            linea: m.lineaProduccion.nombre,
            ruta: m.rutaPasada.nombre,
            pasadaNum: m.pasada?.numero ?? '-',
            pasadaEst: m.pasada?.estado ?? '-',
            etapa: m.etapa.nombre,
            fechaHora: formatDateTime(m.timestamp),
            peso: Number(m.pesoNeto),
            limiteMin: m.pesoMinimo !== undefined ? Number(m.pesoMinimo) : '-',
            pesoIdeal: m.pesoIdeal !== undefined ? Number(m.pesoIdeal) : '-',
            limiteMax: m.pesoMaximo !== undefined ? Number(m.pesoMaximo) : '-',
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

        const resSheet = workbook.addWorksheet(`Pasadas - ${lineName}`.substring(0, 31));
        resSheet.columns = [
          { header: 'Línea de Producción', key: 'linea', width: 20 },
          { header: 'Balanza', key: 'balanza', width: 20 },
          { header: 'Ruta', key: 'ruta', width: 20 },
          { header: 'N° Pasada', key: 'pasadaNum', width: 15 },
          { header: 'Observación', key: 'observacionInicio', width: 30 },
          { header: 'Código', key: 'articuloCodigo', width: 18 },
          { header: 'Artículo', key: 'articulo', width: 20 },
          { header: 'Estado', key: 'estado', width: 15 },
          { header: 'Inicio', key: 'inicio', width: 20 },
          { header: 'Cierre', key: 'cierre', width: 20 },
          { header: 'Duración (min)', key: 'duracion', width: 15 },
          { header: 'Responsable', key: 'responsable', width: 20 },
          { header: 'Total Muestras', key: 'total', width: 15 },
          { header: 'Conformes', key: 'conformes', width: 15 },
          { header: 'Fuera de Rango', key: 'fuera', width: 15 },
          { header: '% Conforme', key: 'porc', width: 15 },
          { header: 'Motivo de Cierre', key: 'motivo', width: 20 },
          { header: 'Observación Cierre', key: 'obs', width: 30 },
        ];
        resSheet.getRow(1).font = { bold: true };

        for (const p of grupo.pasadas) {
          const pm = grupo.muestras.filter(m => m.pasada?.id === p.id);
          const total = pm.length;
          const ok = pm.filter(m => m.estadoValidacion === MuestraEstadoValidacion.OK).length;
          const outside = total - ok;
          const pct = total > 0 ? ((ok / total) * 100).toFixed(1) : "0.0";
          let duracion: number | string = '-';
          if (p.horaCierre) {
            duracion = Math.round((p.horaCierre.getTime() - p.horaInicio.getTime()) / 60000);
          }

          resSheet.addRow({
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
            total: total,
            conformes: ok,
            fuera: outside,
            porc: pct,
            motivo: p.motivoCierre ?? '-',
            obs: p.observacionCierre ?? '-'
          });
        }

        const etapaSheet = workbook.addWorksheet(`Etapas - ${lineName}`.substring(0, 31));
        etapaSheet.columns = [
          { header: 'Línea de Producción', key: 'linea', width: 20 },
          { header: 'Ruta', key: 'ruta', width: 20 },
          { header: 'N° Pasada', key: 'pasadaNum', width: 15 },
          { header: 'Etapa', key: 'etapa', width: 20 },
          { header: 'Total Muestras', key: 'total', width: 15 },
          { header: 'Promedio Peso Neto (kg)', key: 'promedio', width: 20 },
        ];
        etapaSheet.getRow(1).font = { bold: true };

        for (const p of grupo.pasadas) {
          const pm = grupo.muestras.filter(m => m.pasada?.id === p.id);
          const pmPorEtapa = new Map<string, number[]>();
          for (const m of pm) {
            if (!pmPorEtapa.has(m.etapa.nombre)) pmPorEtapa.set(m.etapa.nombre, []);
            pmPorEtapa.get(m.etapa.nombre)!.push(Number(m.pesoNeto));
          }
          for (const [etapa, pesos] of pmPorEtapa.entries()) {
            const sum = pesos.reduce((acc, v) => acc + v, 0);
            const avg = sum / pesos.length;
            etapaSheet.addRow({
              linea: p.lineaProduccion.nombre,
              ruta: p.rutaPasada.nombre,
              pasadaNum: p.numero,
              etapa: etapa,
              total: pesos.length,
              promedio: avg.toFixed(PESO_DECIMALS)
            });
          }
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
      { header: 'Peso Ideal (kg)', key: 'peso_ideal', width: 16 },
      { header: 'Peso Mínimo (kg)', key: 'peso_minimo', width: 16 },
      { header: 'Peso Máximo (kg)', key: 'peso_maximo', width: 16 },
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
