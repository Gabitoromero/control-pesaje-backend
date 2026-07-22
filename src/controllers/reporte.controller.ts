import { Request, Response, NextFunction } from 'express';
import { RequestContext } from '@mikro-orm/core';
import { reporteService } from '../services/reporte.service.js';
import { z } from 'zod';

const reporteQuerySchema = z.object({
  desde: z.string({ message: 'Faltan parámetros desde o hasta' }),
  hasta: z.string({ message: 'Faltan parámetros desde o hasta' }),
});

export const getReportePasadasMuestras = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

    const diffRaw = fechaHasta.getTime() - fechaDesde.getTime();
    // 5 days + 23:59:59.999 = approx 6 days total elapsed ms allowed between start of day 1 and end of day 5
    // Example: 01 to 05 is 5 days inclusive. 05 23:59:59 - 01 00:00:00 = 4 days 23:59:59.
    // If they ask for 6 days (01 to 06), it will be 5 days 23:59:59.
    // We want to limit to 5 days inclusive. So diffRaw must be < 5 days.
    // Actually, difference between 1st 00:00:00 and 5th 23:59:59 is 4.999 days.
    if (diffRaw >= 5 * 24 * 60 * 60 * 1000) {
      res.status(400).json({ success: false, error: 'El rango máximo es de 5 días' });
      return;
    }

    const em = RequestContext.getEntityManager();
    if (!em) {
      res.status(500).json({ success: false, error: 'EntityManager not available' });
      return;
    }

    const workbook = await reporteService.generateReportePasadasMuestras(em, fechaDesde, fechaHasta);

    const isoDesde = desde.split('T')[0];
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-${isoDesde}.xlsx"`);
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
};
