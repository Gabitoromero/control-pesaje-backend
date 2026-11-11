import type { EntityManager } from '@mikro-orm/core';
import { Articulo } from '../models/Articulo.js';
import { ArticuloRutaPasada } from '../models/ArticuloRutaPasada.js';
import { Balanza } from '../models/Balanza.js';
import type { RutaPasada } from '../models/RutaPasada.js';

// The verification route (standard weights) is the one assigned to the articulo with this code.
export const CODIGO_ARTICULO_VERIFICACION = '0';

export const esArticuloVerificacion = (articulo: Pick<Articulo, 'codigo'>): boolean =>
  articulo.codigo === CODIGO_ARTICULO_VERIFICACION;

/**
 * Resolves the verification route at runtime. If several rutas qualify, the lowest id wins.
 */
export async function resolverRutaVerificacion(
  em: EntityManager
): Promise<{ rutaPasada: RutaPasada; articulo: Articulo } | null> {
  const vinculo = await em.findOne(
    ArticuloRutaPasada,
    {
      articulo: { codigo: CODIGO_ARTICULO_VERIFICACION, activo: true },
      rutaPasada: { activo: true },
    },
    { orderBy: { rutaPasada: { id: 'ASC' } }, populate: ['articulo', 'rutaPasada'] }
  );
  return vinculo ? { rutaPasada: vinculo.rutaPasada, articulo: vinculo.articulo } : null;
}

const mensajeBloqueo = (causa: string): string =>
  `Balanza sin verificar: ${causa} Solo se puede iniciar la ruta de verificación con pesas patrón.`;

/**
 * Applies the verification rule when a production pasada / free sample is about to start on a balanza.
 * Mutates the balanza (flag / last article); the caller is responsible for flushing.
 * Returns the Spanish blocking message, or null when the balanza may produce `articulo`.
 * Verification pasadas (articulo code 0) are never evaluated here.
 */
export async function evaluarBalanzaParaProducir(
  em: EntityManager,
  balanza: Balanza,
  articulo: Articulo
): Promise<string | null> {
  if (esArticuloVerificacion(articulo)) return null;

  const ultimoId = balanza.ultimoArticulo?.id ?? null;

  if (ultimoId === null) {
    balanza.verificacionPendiente = true;
    return mensajeBloqueo('la balanza no tiene historial de producción.');
  }

  // Just verified (the verification was run with the standard-weights article): nothing to compare.
  const ultimo = await em.findOne(Articulo, { id: ultimoId });
  const verificadaSinProduccion = ultimo !== null && esArticuloVerificacion(ultimo);

  if (!verificadaSinProduccion && ultimoId !== articulo.id) {
    balanza.verificacionPendiente = true;
    return mensajeBloqueo('cambió el artículo respecto del último producido en esta balanza.');
  }

  if (balanza.verificacionPendiente) {
    return mensajeBloqueo('la verificación está pendiente.');
  }

  if (verificadaSinProduccion) {
    balanza.ultimoArticulo = articulo;
  }
  return null;
}

/**
 * Lowers the flag after a verification pasada completes and records the articulo now in force.
 * Mutates the balanza; the caller is responsible for flushing.
 */
export async function registrarVerificacionCompletada(
  em: EntityManager,
  balanzaId: number,
  articuloVerificacion: Articulo,
  articuloVigente: Articulo | null
): Promise<void> {
  const balanza = await em.findOne(Balanza, { id: balanzaId });
  if (!balanza) return;
  balanza.verificacionPendiente = false;
  balanza.ultimoArticulo =
    articuloVigente && !esArticuloVerificacion(articuloVigente) ? articuloVigente : articuloVerificacion;
}
