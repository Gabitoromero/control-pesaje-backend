import type { EntityManager } from '@mikro-orm/core';
import type { MuestraEstadoValidacion } from '../models/Muestra.js';
import { MAGNITUD_POR_DEFECTO } from '../shared/constants.js';
import type { Magnitud } from '../shared/types/domain.js';

export const HISTORIAL_MAX_PAGE_SIZE = 100;
export const HISTORIAL_DEFAULT_PAGE_SIZE = 20;

export interface HistorialFiltros {
  desde?: Date;
  hasta?: Date;
  etapaId?: number;
  articuloId?: number;
  q?: string;
  page: number;
  pageSize: number;
}

// Raw row of the history query: numeric/decimal columns may come back as strings from the driver.
interface HistorialRow {
  id: number | string;
  timestamp: Date | string;
  peso_neto: number | string;
  peso_ideal: number | string;
  peso_minimo: number | string;
  peso_maximo: number | string;
  estado_validacion: MuestraEstadoValidacion;
  observacion: string | null;
  pasada_id: number | string | null;
  etapa_id: number | string;
  etapa_nombre: string;
  magnitud: Magnitud | null; // null when the etapa is no longer configured in the ruta (left join)
  ruta_id: number | string;
  ruta_nombre: string;
  articulo_id: number | string | null;
  articulo_codigo: string; // null only when articulo_id is null (left join), which is mapped to articulo: null
  articulo_nombre: string | null;
}

export interface HistorialItemDto {
  id: number;
  timestamp: Date;
  pesoNeto: number;
  pesoIdeal: number;
  pesoMinimo: number;
  pesoMaximo: number;
  estadoValidacion: MuestraEstadoValidacion;
  observacion: string | null;
  pasadaId: number | null;
  etapa: { id: number; nombre: string };
  /** Magnitud of the etapa as configured today in its ruta; peso when the etapa is no longer part of it. */
  magnitud: Magnitud;
  rutaPasada: { id: number; nombre: string };
  articulo: { id: number; codigo: string; nombre: string | null } | null;
}

export interface HistorialKpisDto {
  total: number;
  ok: number;
  fueraRango: number;
  porcentajeOk: number;
  porcentajeFueraRango: number;
}

export interface HistorialDto {
  items: HistorialItemDto[];
  total: number;
  page: number;
  pageSize: number;
  kpis: HistorialKpisDto;
}

const ACCENTS_FROM = 'áéíóúüñ';
const ACCENTS_TO = 'aeiouun';

/** Lowercases and strips accents so JS and SQL compare the same way. */
function normalizeSearch(text: string): string {
  return text.trim().toLowerCase().replace(/[áéíóúüñ]/g, ch => ACCENTS_TO[ACCENTS_FROM.indexOf(ch)]);
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, ch => `\\${ch}`);
}

const FROM_SQL = `
  from muestra m
  join etapa e on e.id = m.etapa_id
  join ruta_pasada r on r.id = m.ruta_pasada_id
  left join pasada p on p.id = m.pasada_id
  left join articulo a on a.id = p.articulo_id`;

// Text columns the search box matches against (accent/case-insensitive).
const SEARCH_COLUMNS = ['a.codigo', 'a.nombre', 'e.nombre', 'r.nombre', 'm.observacion'];

const round2 = (n: number) => Math.round(n * 100) / 100;

export const historialService = {
  /**
   * Muestras (from pasadas and free) owned by `usuarioId`, newest first,
   * with KPIs computed over the whole filtered set (not only the current page).
   * `usuarioId` must come from the authenticated token, never from the request.
   */
  async list(em: EntityManager, usuarioId: number, filtros: HistorialFiltros): Promise<HistorialDto> {
    const conditions: string[] = ['m.usuario_id = ?'];
    const params: unknown[] = [usuarioId];

    if (filtros.desde) {
      conditions.push('m.timestamp >= ?');
      params.push(filtros.desde);
    }
    if (filtros.hasta) {
      conditions.push('m.timestamp <= ?');
      params.push(filtros.hasta);
    }
    if (filtros.etapaId !== undefined) {
      conditions.push('m.etapa_id = ?');
      params.push(filtros.etapaId);
    }
    if (filtros.articuloId !== undefined) {
      conditions.push('p.articulo_id = ?');
      params.push(filtros.articuloId);
    }

    const term = filtros.q ? normalizeSearch(filtros.q) : '';
    if (term) {
      const normalized = (col: string) =>
        `translate(lower(coalesce(${col}, '')), '${ACCENTS_FROM}', '${ACCENTS_TO}')`;
      const pattern = `%${escapeLike(term)}%`;
      conditions.push(`(${SEARCH_COLUMNS.map(col => `${normalized(col)} like ? escape '\\'`).join(' or ')})`);
      for (let i = 0; i < SEARCH_COLUMNS.length; i++) params.push(pattern);
    }

    const where = `where ${conditions.join(' and ')}`;
    // Raw SQL on purpose: one shared WHERE for the list and the FILTER-based KPI counts, plus accent-insensitive search.
    const connection = em.getConnection();

    const [counts] = (await connection.execute(
      `select count(*) as total,
              count(*) filter (where m.estado_validacion = 'ok') as ok,
              count(*) filter (where m.estado_validacion = 'fuera_de_rango') as fuera_rango
       ${FROM_SQL} ${where}`,
      params,
    )) as Array<{ total: string; ok: string; fuera_rango: string }>;

    const total = Number(counts.total);
    const ok = Number(counts.ok);
    const fueraRango = Number(counts.fuera_rango);

    const offset = (filtros.page - 1) * filtros.pageSize;
    const rows = (await connection.execute(
      `select m.id, m.timestamp, m.peso_neto, m.peso_ideal, m.peso_minimo, m.peso_maximo,
              m.estado_validacion, m.observacion, m.pasada_id,
              e.id as etapa_id, e.nombre as etapa_nombre,
              rpe.magnitud as magnitud,
              r.id as ruta_id, r.nombre as ruta_nombre,
              a.id as articulo_id, a.codigo as articulo_codigo, a.nombre as articulo_nombre
       ${FROM_SQL}
       left join ruta_pasada_etapa rpe on rpe.ruta_pasada_id = m.ruta_pasada_id and rpe.etapa_id = m.etapa_id
       ${where}
       order by m.timestamp desc, m.id desc
       limit ? offset ?`,
      [...params, filtros.pageSize, offset],
    )) as HistorialRow[];

    const items: HistorialItemDto[] = rows.map(row => ({
      id: Number(row.id),
      timestamp: new Date(row.timestamp),
      pesoNeto: Number(row.peso_neto),
      pesoIdeal: Number(row.peso_ideal),
      pesoMinimo: Number(row.peso_minimo),
      pesoMaximo: Number(row.peso_maximo),
      estadoValidacion: row.estado_validacion,
      observacion: row.observacion ?? null,
      pasadaId: row.pasada_id === null ? null : Number(row.pasada_id),
      etapa: { id: Number(row.etapa_id), nombre: row.etapa_nombre },
      magnitud: row.magnitud ?? MAGNITUD_POR_DEFECTO,
      rutaPasada: { id: Number(row.ruta_id), nombre: row.ruta_nombre },
      articulo:
        row.articulo_id === null
          ? null
          : { id: Number(row.articulo_id), codigo: row.articulo_codigo, nombre: row.articulo_nombre ?? null },
    }));

    return {
      items,
      total,
      page: filtros.page,
      pageSize: filtros.pageSize,
      kpis: {
        total,
        ok,
        fueraRango,
        porcentajeOk: total > 0 ? round2((ok / total) * 100) : 0,
        porcentajeFueraRango: total > 0 ? round2((fueraRango / total) * 100) : 0,
      },
    };
  },
};
