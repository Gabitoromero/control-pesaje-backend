import type { UnidadPeso } from './types/domain.js';

export const PESO_DECIMALS = 4;

/** Conversion factor to kilograms for each recognized source unit. */
export const UNIDAD_PESO_FACTORES: Record<UnidadPeso, number> = {
  g: 0.001,
  kg: 1,
};
