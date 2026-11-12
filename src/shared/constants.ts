import type { Magnitud, UnidadPeso } from './types/domain.js';

export const PESO_DECIMALS = 4;

/** Conversion factor to kilograms for each recognized source unit. */
export const UNIDAD_PESO_FACTORES: Record<UnidadPeso, number> = {
  g: 0.001,
  kg: 1,
};

/** Magnitudes a ruta-etapa can measure. */
export const MAGNITUDES = ['peso', 'volumen'] as const satisfies readonly Magnitud[];

export const MAGNITUD_POR_DEFECTO: Magnitud = 'peso';

/** Unit shown for a weight depending on the magnitud of its ruta-etapa. Volumen never converts the value: g reads as mL and kg as L. */
export const UNIDAD_LABELS: Record<Magnitud, Record<UnidadPeso, string>> = {
  peso: { g: 'g', kg: 'kg' },
  volumen: { g: 'mL', kg: 'L' },
};
