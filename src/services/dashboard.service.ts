import type { EntityManager } from '@mikro-orm/core';
import { Pasada, PasadaEstado } from '../models/Pasada.js';
import { Muestra, MuestraEstadoValidacion } from '../models/Muestra.js';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { RutaPasadaEtapa } from '../models/RutaPasadaEtapa.js';

// ── Response DTOs ────────────────────────────────────────────────────────────

export interface LineaDto {
  id: number;
  nombre: string;
  activo: boolean;
  rutaPasadaActiva: { id: number; nombre: string } | null;
  dispositivo: { id: number } | null;
}

export interface PasadaEnCursoDto {
  id: number;
  horaInicio: Date;
  estado: string;
  tiempoTranscurrido: number;
}

export interface ResumenDto {
  conectado: boolean;
  pasadaEnCurso: PasadaEnCursoDto | null;
}

export interface KpisDto {
  muestrasTotales: number;
  fueraRango: number;
  pasadasFinalizadas: number;
  pasadasEnCurso: number;
}

export interface TimeSeriesPunto {
  peso: number;
  time: Date;
}

export interface EtapaDto {
  etapa: { id: number; nombre: string };
  pesoIdeal: number;
  pesoMinimo: number;
  pesoMaximo: number;
  ultimoPeso: number;
  porcentajeConforme: number;
  timeSeries: TimeSeriesPunto[];
}

// ── Service ──────────────────────────────────────────────────────────────────

export const dashboardService = {

  async getLineas(em: EntityManager): Promise<LineaDto[]> {
    const lineas = await em.find(
      LineaProduccion,
      { activo: true },
      { populate: ['rutaPasadaActiva', 'dispositivo'] }
    );
    return lineas.map(l => ({
      id: l.id,
      nombre: l.nombre,
      activo: l.activo,
      rutaPasadaActiva: l.rutaPasadaActiva
        ? { id: l.rutaPasadaActiva.id, nombre: l.rutaPasadaActiva.nombre }
        : null,
      dispositivo: l.dispositivo ? { id: l.dispositivo.id } : null,
    }));
  },

  async getResumen(em: EntityManager, lineaId: number): Promise<ResumenDto | null> {
    const pasada = await em.findOne(Pasada, {
      lineaProduccion: lineaId,
      estado: PasadaEstado.EN_CURSO,
      activo: true,
    });

    if (!pasada) {
      // Return null to signal "no route assigned" (caller returns 404)
      const linea = await em.findOne(LineaProduccion, { id: lineaId, activo: true });
      if (!linea?.rutaPasadaActiva) return null;

      // Has a route but no active pasada → "esperando"
      return { conectado: false, pasadaEnCurso: null };
    }

    const tiempoTranscurrido = Date.now() - new Date(pasada.horaInicio).getTime();
    return {
      conectado: false, // caller will override with deviceRegistryService
      pasadaEnCurso: {
        id: pasada.id,
        horaInicio: pasada.horaInicio,
        estado: pasada.estado,
        tiempoTranscurrido,
      },
    };
  },

  async getKpis(em: EntityManager, lineaId: number): Promise<KpisDto | null> {
    const pasada = await em.findOne(
      Pasada,
      { lineaProduccion: lineaId, estado: PasadaEstado.EN_CURSO, activo: true },
      { populate: ['rutaPasada'] }
    );

    if (!pasada) {
      const linea = await em.findOne(LineaProduccion, { id: lineaId, activo: true });
      if (!linea?.rutaPasadaActiva) return null;
      return { muestrasTotales: 0, fueraRango: 0, pasadasFinalizadas: 0, pasadasEnCurso: 0 };
    }

    const timeZero = pasada.horaInicio;

    const muestras = await em.find(Muestra, {
      pasada: pasada.id,
      timestamp: { $gte: timeZero },
    }, { populate: ['etapa'] });

    const fueraRango = muestras.filter(
      m => m.estadoValidacion === MuestraEstadoValidacion.FUERA_DE_RANGO
    ).length;

    const pasadasFinalizadas = await em.count(Pasada, {
      lineaProduccion: lineaId,
      estado: PasadaEstado.COMPLETA,
      horaInicio: { $gte: timeZero },
    });

    const pasadasEnCurso = await em.count(Pasada, {
      lineaProduccion: lineaId,
      estado: PasadaEstado.EN_CURSO,
      horaInicio: { $gte: timeZero },
    });

    return { muestrasTotales: muestras.length, fueraRango, pasadasFinalizadas, pasadasEnCurso };
  },

  async getEtapas(em: EntityManager, lineaId: number): Promise<EtapaDto[] | null> {
    const pasada = await em.findOne(
      Pasada,
      { lineaProduccion: lineaId, estado: PasadaEstado.EN_CURSO, activo: true },
      { populate: ['rutaPasada'] }
    );

    if (!pasada) {
      const linea = await em.findOne(LineaProduccion, { id: lineaId, activo: true });
      if (!linea?.rutaPasadaActiva) return null;
      return [];
    }

    if (!pasada.rutaPasada) return [];

    const timeZero = pasada.horaInicio;

    const configEtapas = await em.find(RutaPasadaEtapa, {
      rutaPasada: pasada.rutaPasada.id,
    }, { populate: ['etapa'] });

    const muestras = await em.find(Muestra, {
      pasada: pasada.id,
      timestamp: { $gte: timeZero },
    }, { populate: ['etapa'] });

    // Group samples by etapaId
    const samplesByEtapa = new Map<number, Muestra[]>();
    for (const m of muestras) {
      const arr = samplesByEtapa.get(m.etapa.id) ?? [];
      arr.push(m);
      samplesByEtapa.set(m.etapa.id, arr);
    }

    return configEtapas.map(ce => {
      const etapaMuestras = samplesByEtapa.get(ce.etapa.id) ?? [];
      const ultimoPeso = etapaMuestras.length > 0
        ? Number(etapaMuestras[etapaMuestras.length - 1].pesoNeto)
        : 0;
      const conformeCount = etapaMuestras.filter(
        sm => sm.estadoValidacion === MuestraEstadoValidacion.OK
      ).length;
      const porcentajeConforme = etapaMuestras.length > 0
        ? (conformeCount / etapaMuestras.length) * 100
        : 0;

      return {
        etapa: { id: ce.etapa.id, nombre: ce.etapa.nombre },
        pesoIdeal: Number(ce.pesoIdeal),
        pesoMinimo: Number(ce.pesoMinimo),
        pesoMaximo: Number(ce.pesoMaximo),
        ultimoPeso,
        porcentajeConforme,
        timeSeries: etapaMuestras.map(sm => ({ peso: Number(sm.pesoNeto), time: sm.timestamp })),
      };
    });
  },
};
