import { PESO_DECIMALS, UNIDAD_PESO_FACTORES } from './constants.js';
import type { UnidadPeso } from './types/domain.js';

/** Type guard for the recognized UnidadPeso domain (`'g' | 'kg'`). Used to
 * fail closed on a missing/unknown unit instead of assuming a default. */
export const isUnidadPeso = (value: unknown): value is UnidadPeso =>
  typeof value === 'string' && Object.hasOwn(UNIDAD_PESO_FACTORES, value);

/**
 * Converts a raw weight value transmitted by a physical scale into the
 * canonical kilograms unit persisted/broadcast by the system.
 *
 * Rounds explicitly at PESO_DECIMALS to avoid IEEE-754 float artifacts
 * (e.g. `220.5 / 1000` style division producing trailing noise).
 */
export const toKilogramos = (valor: number, unidad: UnidadPeso): number => {
  const factor = UNIDAD_PESO_FACTORES[unidad];
  const escala = 10 ** PESO_DECIMALS;
  return Math.round(valor * factor * escala) / escala;
};
