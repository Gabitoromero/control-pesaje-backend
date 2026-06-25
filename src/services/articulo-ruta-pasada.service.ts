import { RequestContext, RequiredEntityData } from '@mikro-orm/core';
import { ArticuloRutaPasada } from '../models/ArticuloRutaPasada.js';

/**
 * Standalone service for ArticuloRutaPasada (pivot table).
 *
 * Does NOT extend BaseService because ArticuloRutaPasada has no `activo` field
 * and the BaseService constraint requires `T extends { id; activo }`.
 *
 * All deletions are hard deletes (physical row removal).
 */
export class ArticuloRutaPasadaService {
  protected getEm() {
    const em = RequestContext.getEntityManager();
    if (!em) throw new Error('No EntityManager in RequestContext');
    return em;
  }

  async findAll(rutaPasadaId?: number): Promise<ArticuloRutaPasada[]> {
    const where = rutaPasadaId
      ? { rutaPasada: rutaPasadaId }
      : {};
    return this.getEm().find(ArticuloRutaPasada, where, { populate: ['articulo'] });
  }

  async findOne(id: number): Promise<ArticuloRutaPasada | null> {
    return this.getEm().findOne(ArticuloRutaPasada, { id }, { populate: ['articulo'] });
  }

  async create(data: RequiredEntityData<ArticuloRutaPasada>): Promise<ArticuloRutaPasada> {
    const em = this.getEm();
    const entity = em.create(ArticuloRutaPasada, data);
    await em.flush();
    return entity;
  }

  async remove(id: number): Promise<boolean> {
    const em = this.getEm();
    const entity = await em.findOne(ArticuloRutaPasada, { id });
    if (!entity) return false;
    em.remove(entity);
    await em.flush();
    return true;
  }
}
