import type { Magnitud, TipoAtributo, UnidadPeso } from './types/domain.js';

export const PESO_DECIMALS = 4;

/** Conversion factor to kilograms for each recognized source unit. */
export const UNIDAD_PESO_FACTORES: Record<UnidadPeso, number> = {
  g: 0.001,
  kg: 1,
};

/** Magnitudes a ruta-etapa can measure. */
export const MAGNITUDES = ['peso', 'volumen'] as const satisfies readonly Magnitud[];

export const MAGNITUD_POR_DEFECTO: Magnitud = 'peso';

/** Kinds of manual quality (atributo) a ruta-etapa can define. */
export const TIPOS_ATRIBUTO = ['numerico', 'aceptado'] as const satisfies readonly TipoAtributo[];

/** Stored values of an 'aceptado' atributo; its acceptance range is fixed to 1..1. */
export const VALOR_ATRIBUTO_ACEPTADO = 1;
export const VALOR_ATRIBUTO_NO_ACEPTADO = 0;

/** Decimal places of an atributo value and its range. */
export const ATRIBUTO_DECIMALS = 4;

/** Atributos a ruta-etapa may define for now (the pasadas Excel has two attribute columns per etapa). */
export const MAX_ATRIBUTOS_POR_ETAPA = 2;

/** Unit shown for a weight depending on the magnitud of its ruta-etapa. Volumen never converts the value: g reads as mL and kg as L. */
export const UNIDAD_LABELS: Record<Magnitud, Record<UnidadPeso, string>> = {
  peso: { g: 'g', kg: 'kg' },
  volumen: { g: 'mL', kg: 'L' },
};
