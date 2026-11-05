import { Request, Response, NextFunction } from 'express';
import { RequestContext } from '@mikro-orm/core';
import { reporteService } from '../services/reporte.service.js';
import { z } from 'zod';

const reporteQuerySchema = z.object({
  desde: z.string({ message: 'Faltan parámetros desde o hasta' }),
  hasta: z.string({ message: 'Faltan parámetros desde o hasta' }),
});

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// Keep in sync with MAX_RANGE_DAYS in the frontend ReportesPage.
const MAX_RANGE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

// Both date-range reports (muestras, pasadas) share the same query params, validation and range limit.
const createRangeReportHandler = (
  filenamePrefix: string,
  generator: 'generateReporteMuestras' | 'generateReportePasadas'
) => async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parseResult = reporteQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({ success: false, error: 'Faltan parámetros desde o hasta' });
      return;
    }

    const { desde, hasta } = parseResult.data;

    const fechaDesdeStr = desde.split('T')[0];
    const fechaHastaStr = hasta.split('T')[0];

    const fechaDesde = new Date(`${fechaDesdeStr}T00:00:00.000-03:00`);
    const fechaHasta = new Date(`${fechaHastaStr}T23:59:59.999-03:00`);

    if (isNaN(fechaDesde.getTime()) || isNaN(fechaHasta.getTime())) {
      res.status(400).json({ success: false, error: 'Fechas inválidas' });
      return;
    }

    // The range is inclusive of both days: N days elapse as N-1 days + 23:59:59.999, so N days is
    // allowed and N+1 days (elapsed >= N days) is rejected.
    if (fechaHasta.getTime() - fechaDesde.getTime() >= MAX_RANGE_DAYS * DAY_MS) {
      res.status(400).json({ success: false, error: `El rango máximo es de ${MAX_RANGE_DAYS} días` });
      return;
    }

    const em = RequestContext.getEntityManager();
    if (!em) {
      res.status(500).json({ success: false, error: 'EntityManager not available' });
      return;
    }

    const workbook = await reporteService[generator](em, fechaDesde, fechaHasta);

    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader('Content-Disposition', `attachment; filename="${filenamePrefix}-${fechaDesdeStr}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
};

export const getReporteMuestras = createRangeReportHandler('reporte-muestras', 'generateReporteMuestras');
export const getReportePasadas = createRangeReportHandler('reporte-pasadas', 'generateReportePasadas');

const PLANT_TIME_ZONE = 'America/Argentina/Buenos_Aires';

function formatIsoDateInTz(date: Date, timeZone: string = PLANT_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export const getReporteRutasPasada = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const em = RequestContext.getEntityManager();
    if (!em) {
      res.status(500).json({ success: false, error: 'EntityManager not available' });
      return;
    }

    const workbook = await reporteService.generateReporteRutasPasada(em);

    const fecha = formatIsoDateInTz(new Date());
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-rutas-pasada-${fecha}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
};
