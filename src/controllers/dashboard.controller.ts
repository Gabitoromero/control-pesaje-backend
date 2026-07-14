import type { Request, Response, NextFunction } from 'express';
import { RequestContext } from '@mikro-orm/core';
import { Pasada, PasadaEstado } from '../models/Pasada.js';
import { Muestra, MuestraEstadoValidacion } from '../models/Muestra.js';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { RutaPasadaEtapa } from '../models/RutaPasadaEtapa.js';
import { deviceRegistryService } from '../services/device-registry.service.js';

export const getLineas = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const em = RequestContext.getEntityManager();
    if (!em) { res.status(500).json({ success: false, error: { message: 'EntityManager not available' } }); return; }
    const lineas = await em.find(LineaProduccion, { activo: true }, { populate: ['rutaPasadaActiva', 'dispositivo'] });
    const data = lineas.map(l => ({
      id: l.id,
      nombre: l.nombre,
      activo: l.activo,
      rutaPasadaActiva: l.rutaPasadaActiva ? { id: l.rutaPasadaActiva.id, nombre: l.rutaPasadaActiva.nombre } : null,
      dispositivo: l.dispositivo ? { id: l.dispositivo.id } : null,
    }));
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};


export const getResumen = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lineaId = Number(req.params.lineaId);
    const em = RequestContext.getEntityManager();
    if (!em) { res.status(500).json({ success: false, error: { message: 'EntityManager not available' } }); return; }

    const pasada = await em.findOne(Pasada, {
      lineaProduccion: lineaId,
      estado: PasadaEstado.EN_CURSO,
      activo: true
    });

    if (!pasada) {
      const linea = await em.findOne(LineaProduccion, { id: lineaId, activo: true });

      if (!linea?.rutaPasadaActiva) {
        res.status(404).json({ success: false, error: { message: 'No hay pasada activa para esta linea' } });
        return;
      }

      const conectadoEsperando = deviceRegistryService.hasDeviceForLinea(lineaId);
      res.status(200).json({
        success: true,
        data: {
          conectado: conectadoEsperando,
          pasadaEnCurso: null
        }
      });
      return;
    }

    const conectado = deviceRegistryService.hasDeviceForLinea(lineaId);
    const tiempoTranscurrido = new Date().getTime() - new Date(pasada.horaInicio).getTime();

    res.status(200).json({
      success: true,
      data: {
        conectado,
        pasadaEnCurso: {
          id: pasada.id,
          horaInicio: pasada.horaInicio,
          estado: pasada.estado,
          tiempoTranscurrido
        }
      }
    });
  } catch (err) {
    next(err);
  }
};


export const getKpis = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lineaId = Number(req.params.lineaId);
    const em = RequestContext.getEntityManager();
    if (!em) { res.status(500).json({ error: 'EntityManager not available' }); return; }

    const pasada = await em.findOne(Pasada, {
      lineaProduccion: lineaId,
      estado: PasadaEstado.EN_CURSO,
      activo: true
    }, { populate: ['rutaPasada'] });

    if (!pasada) {
      const linea = await em.findOne(LineaProduccion, { id: lineaId, activo: true });

      if (!linea?.rutaPasadaActiva) {
        res.status(404).json({ success: false, error: { message: 'No hay pasada activa para esta linea' } });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          muestrasTotales: 0,
          fueraRango: 0,
          pasadasFinalizadas: 0,
          pasadasEnCurso: 0
        }
      });
      return;
    }

    const timeZero = pasada.horaInicio;

    const muestras = await em.find(Muestra, {
      pasada: pasada.id,
      timestamp: { $gte: timeZero }
    }, { populate: ['etapa'] });

    const fueraRango = muestras.filter(m => m.estadoValidacion === MuestraEstadoValidacion.FUERA_DE_RANGO).length;

    const pasadasFinalizadas = await em.count(Pasada, {
      lineaProduccion: lineaId,
      estado: PasadaEstado.COMPLETA,
      horaInicio: { $gte: timeZero }
    });

    const pasadasEnCurso = await em.count(Pasada, {
      lineaProduccion: lineaId,
      estado: PasadaEstado.EN_CURSO,
      horaInicio: { $gte: timeZero }
    });

    res.status(200).json({
      success: true,
      data: {
        muestrasTotales: muestras.length,
        fueraRango,
        pasadasFinalizadas,
        pasadasEnCurso
      }
    });
  } catch (err) {
    next(err);
  }
};


export const getEtapas = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lineaId = Number(req.params.lineaId);
    const em = RequestContext.getEntityManager();
    if (!em) { res.status(500).json({ error: 'EntityManager not available' }); return; }

    const pasada = await em.findOne(Pasada, {
      lineaProduccion: lineaId,
      estado: PasadaEstado.EN_CURSO,
      activo: true
    }, { populate: ['rutaPasada'] });

    if (!pasada) {
      const linea = await em.findOne(LineaProduccion, { id: lineaId, activo: true });

      if (!linea?.rutaPasadaActiva) {
        res.status(404).json({ success: false, error: { message: 'No hay pasada activa para esta linea' } });
        return;
      }

      res.status(200).json({ success: true, data: [] });
      return;
    }

    if (!pasada.rutaPasada) {
      res.status(200).json({ success: true, data: [] });
      return;
    }

    const timeZero = pasada.horaInicio;
    
    // Fetch RutaPasadaEtapa for the active route
    const configEtapas = await em.find(RutaPasadaEtapa, {
      rutaPasada: pasada.rutaPasada.id
    }, { populate: ['etapa'] });

    // Fetch Muestras
    const muestras = await em.find(Muestra, {
      pasada: pasada.id,
      timestamp: { $gte: timeZero }
    }, { populate: ['etapa'] });

    // Group samples by etapaId
    const samplesByEtapa = new Map<number, Muestra[]>();
    for (const m of muestras) {
      const arr = samplesByEtapa.get(m.etapa.id) || [];
      arr.push(m);
      samplesByEtapa.set(m.etapa.id, arr);
    }

    const result = configEtapas.map(ce => {
      const m = samplesByEtapa.get(ce.etapa.id) || [];
      
      const ultimoPeso = m.length > 0 ? Number(m[m.length - 1].pesoNeto) : 0;

      const conformeCount = m.filter(sm => sm.estadoValidacion === MuestraEstadoValidacion.OK).length;
      const porcentajeConforme = m.length > 0 ? (conformeCount / m.length) * 100 : 0;

      return {
        etapa: ce.etapa,
        pesoIdeal: Number(ce.pesoIdeal),
        pesoMinimo: Number(ce.pesoMinimo),
        pesoMaximo: Number(ce.pesoMaximo),
        ultimoPeso,
        porcentajeConforme,
        timeSeries: m.map(sm => ({ peso: Number(sm.pesoNeto), time: sm.timestamp }))
      };
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
};
