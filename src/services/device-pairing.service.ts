import type { EntityManager } from '@mikro-orm/core';
import { LineaProduccion } from '../models/LineaProduccion.js';

/**
 * Stateless-function device pairing service. Both functions are `em`-parameterized
 * (never call RequestContext.getEntityManager() internally) because the socket
 * connection callback runs OUTSIDE RequestContext (orm.em.fork()), while REST
 * controllers run INSIDE it. This is the single source of truth for
 * hardwareId -> línea lookup and atomic reassignment.
 */

export async function findLineaByHardwareId(
  em: EntityManager,
  hardwareId: string
): Promise<LineaProduccion | null> {
  return em.findOne(LineaProduccion, { hardwareId, activo: true });
}

export async function assignHardwareIdToLinea(
  em: EntityManager,
  lineaId: number,
  hardwareId: string
): Promise<LineaProduccion | null> {
  return em.transactional(async (tem) => {
    const target = await tem.findOne(LineaProduccion, { id: lineaId });
    if (!target) return null;

    const previous = await tem.findOne(LineaProduccion, { hardwareId });
    if (previous && previous.id !== lineaId) {
      previous.hardwareId = undefined;
      await tem.flush(); // clear FIRST to release the UNIQUE constraint before re-set
    }

    target.hardwareId = hardwareId;
    await tem.flush();
    return target;
  });
}
