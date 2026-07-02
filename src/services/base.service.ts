import { RequestContext, EntityClass, FilterQuery, RequiredEntityData } from '@mikro-orm/core';

/**
 * Abstract base service providing generic CRUD and soft-delete operations.
 * Concrete services extend this and add entity-specific restrict validation.
 */
export abstract class BaseService<T extends { id: number; activo: boolean }> {
  protected readonly entityClass: EntityClass<T>;

  constructor(entityClass: EntityClass<T>) {
    this.entityClass = entityClass;
  }

  protected getEm() {
    const em = RequestContext.getEntityManager();
    if (!em) throw new Error('No EntityManager in RequestContext');
    return em;
  }

  async findAll(where?: Record<string, unknown>): Promise<T[]> {
    return this.getEm().find(this.entityClass, { activo: true, ...where } as unknown as FilterQuery<T>);
  }

  async findAllInactive(): Promise<T[]> {
    return this.getEm().find(this.entityClass, { activo: false } as unknown as FilterQuery<T>);
  }

  async findById(id: number): Promise<T | null> {
    return this.getEm().findOne(this.entityClass, { id } as FilterQuery<T>);
  }

  async create(data: RequiredEntityData<T>): Promise<T> {
    const em = this.getEm();
    const entity = em.create(this.entityClass, data);
    await em.flush();
    return entity;
  }

  async update(id: number, data: Partial<T>): Promise<T | null> {
    const em = this.getEm();
    const entity = await em.findOne(this.entityClass, { id } as FilterQuery<T>);
    if (!entity) return null;
    Object.assign(entity, data);
    await em.flush();
    return entity;
  }

  /**
   * Sets activo = false (soft delete). Subclasses should override
   * to add restrict checks before calling super.softDelete().
   */
  async softDelete(id: number): Promise<boolean> {
    const em = this.getEm();
    const entity = await em.findOne(this.entityClass, { id } as FilterQuery<T>);
    if (!entity) return false;
    entity.activo = false;
    await em.flush();
    return true;
  }
}
