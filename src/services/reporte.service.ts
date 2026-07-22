import { EntityManager } from '@mikro-orm/core';
import { Response } from 'express';
import exceljs from 'exceljs';
import { Muestra, MuestraEstadoValidacion } from '../models/Muestra.js';
import { Pasada } from '../models/Pasada.js';
import { LineaProduccion } from '../models/LineaProduccion.js';

function formatDateTime(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const reporteService = {
  async generarReportePasadasMuestras(em: EntityManager, desde: Date, hasta: Date, res: Response): Promise<void> {
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
        populate: ['lineaProduccion', 'rutaPasada', 'articulo', 'usuario'] as const,
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
        const detailSheet = workbook.addWorksheet(`Detalle - ${lineName}`.substring(0, 31));
        
        detailSheet.columns = [
          { header: 'Línea de Producción', key: 'linea', width: 20 },
          { header: 'Ruta', key: 'ruta', width: 20 },
          { header: 'N° Pasada', key: 'pasadaNum', width: 15 },
          { header: 'Estado Pasada', key: 'pasadaEst', width: 15 },
          { header: 'Etapa', key: 'etapa', width: 20 },
          { header: 'Artículo', key: 'articulo', width: 20 },
          { header: 'Fecha/Hora Muestra', key: 'fechaHora', width: 20 },
          { header: 'Peso Neto (g)', key: 'peso', width: 15 },
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
            articulo: m.pasada?.articulo?.nombre ?? '-',
            fechaHora: formatDateTime(m.timestamp),
            peso: Number(m.pesoNeto),
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

        const resSheet = workbook.addWorksheet(`Resumen - ${lineName}`.substring(0, 31));
        resSheet.columns = [
          { header: 'Línea de Producción', key: 'linea', width: 20 },
          { header: 'Ruta', key: 'ruta', width: 20 },
          { header: 'N° Pasada', key: 'pasadaNum', width: 15 },
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
            ruta: p.rutaPasada.nombre,
            pasadaNum: p.numero,
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
      }
    }

    const isoDesde = desde.toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-${isoDesde}.xlsx"`);
    
    await workbook.xlsx.write(res);
    res.end();
  }
};
