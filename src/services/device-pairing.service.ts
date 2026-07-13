import type { EntityManager } from '@mikro-orm/core';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { Dispositivo } from '../models/Dispositivo.js';

/**
 * Stateless-function device pairing service. Both functions are `em`-parameterized
 * (never call RequestContext.getEntityManager() internally) because the socket
 * connection callback runs OUTSIDE RequestContext (orm.em.fork()), while REST
 * controllers run INSIDE it. This is the single source of truth for
 * hardwareId -> línea lookup and atomic reassignment.
 *
 * `Dispositivo` is the sole owner of `hardwareId` and of the línea<->device
 * link (see sdd/linea-dispositivo-normalization/design). `LineaProduccion`
 * no longer carries a `hardwareId` column.
 */

export async function findDispositivoByHardwareId(
  em: EntityManager,
  hardwareId: string
): Promise<Dispositivo | null> {
  return em.findOne(Dispositivo, { hardwareId }, { populate: ['lineaProduccion'] });
}

export async function findLineaByHardwareId(
  em: EntityManager,
  hardwareId: string
): Promise<LineaProduccion | null> {
  const dispositivo = await findDispositivoByHardwareId(em, hardwareId);
  const linea = dispositivo?.lineaProduccion ?? null;
  return linea && linea.activo ? linea : null;
}

export async function assignHardwareIdToLinea(
  em: EntityManager,
  lineaId: number,
  hardwareId: string
): Promise<{ linea: LineaProduccion; dispositivo: Dispositivo } | null> {
  return em.transactional(async (tem) => {
    const target = await tem.findOne(LineaProduccion, { id: lineaId }, { populate: ['dispositivo'] });
    if (!target) return null;

    if (target.dispositivo && target.dispositivo.hardwareId !== hardwareId) {
      throw new Error('Validation Error: La línea ya tiene un dispositivo asignado');
    }

    let dispositivo = await tem.findOne(Dispositivo, { hardwareId }, { populate: ['lineaProduccion'] });
    if (!dispositivo) {
      dispositivo = tem.create(Dispositivo, { hardwareId, nombre: `Pi-${hardwareId.substring(0, 4)}` });
      tem.persist(dispositivo);
    } else {
      if (dispositivo.lineaProduccion && dispositivo.lineaProduccion.id !== target.id) {
        throw new Error('Validation Error: El dispositivo ya está asignado a otra línea');
      }
    }

    target.dispositivo = dispositivo;
    await tem.flush();

    return { linea: target, dispositivo };
  });
}
