import { RequestContext, RequiredEntityData } from '@mikro-orm/core';
import { RutaPasadaEtapa } from '../models/RutaPasadaEtapa.js';

/**
 * Standalone service for RutaPasadaEtapa (pivot table).
 *
 * Does NOT extend BaseService because RutaPasadaEtapa has no `activo` field
 * and the BaseService constraint requires `T extends { id; activo }`.
 *
 * All deletions are hard deletes (physical row removal).
 */
export class RutaPasadaEtapaService {
  protected getEm() {
    const em = RequestContext.getEntityManager();
    if (!em) throw new Error('No EntityManager in RequestContext');
    return em;
  }

  async findAll(rutaPasadaId?: number): Promise<RutaPasadaEtapa[]> {
    const where = rutaPasadaId
      ? { rutaPasada: rutaPasadaId }
      : {};
    return this.getEm().find(RutaPasadaEtapa, where, { populate: ['etapa'] });
  }

  async findOne(id: number): Promise<RutaPasadaEtapa | null> {
    return this.getEm().findOne(RutaPasadaEtapa, { id }, { populate: ['etapa'] });
  }

  async create(data: RequiredEntityData<RutaPasadaEtapa>): Promise<RutaPasadaEtapa> {
    const em = this.getEm();
    const entity = em.create(RutaPasadaEtapa, data);
    await em.flush();
    return entity;
  }

  async remove(id: number): Promise<boolean> {
    const em = this.getEm();
    const entity = await em.findOne(RutaPasadaEtapa, { id });
    if (!entity) return false;
    em.remove(entity);
    await em.flush();
    return true;
  }
}
