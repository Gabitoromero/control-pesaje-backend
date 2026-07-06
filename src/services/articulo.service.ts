import { BaseService } from './base.service.js';
import { Articulo } from '../models/Articulo.js';
import { ArticuloRutaPasada } from '../models/ArticuloRutaPasada.js';
import { RestrictError } from '../utils/errors.js';

export { RestrictError } from '../utils/errors.js';

import { RequiredEntityData } from '@mikro-orm/core';
import { ValidationError } from '../utils/errors.js';

export class ArticuloService extends BaseService<Articulo> {
  constructor() {
    super(Articulo);
  }

  override async create(data: RequiredEntityData<Articulo>): Promise<Articulo> {
    const em = this.getEm();
    if (data.nombre && data.marca !== undefined) {
      const existing = await em.findOne(Articulo, { nombre: data.nombre, marca: data.marca });
      if (existing) {
        throw new ValidationError(`Articulo with nombre '${data.nombre}' and marca '${data.marca}' already exists`);
      }
    }
    return super.create(data);
  }

  override async update(id: number, data: Partial<Articulo>): Promise<Articulo | null> {
    const em = this.getEm();
    
    // We only need to check if both are present in data, OR we need to fetch the existing entity to get the missing one.
    // Wait, the requirement says "check const existing = await em.findOne(Articulo, { nombre, marca })"
    // Since it's a partial update, we must get the final nombre and marca.
    if (data.nombre !== undefined || data.marca !== undefined) {
      const current = await em.findOne(Articulo, { id });
      if (current) {
        const nombreToCheck = data.nombre !== undefined ? data.nombre : current.nombre;
        const marcaToCheck = data.marca !== undefined ? data.marca : current.marca;
        
        const existing = await em.findOne(Articulo, { nombre: nombreToCheck, marca: marcaToCheck });
        if (existing && existing.id !== id) {
          throw new ValidationError(`Articulo with nombre '${nombreToCheck}' and marca '${marcaToCheck}' already exists`);
        }
      }
    }
    
    return super.update(id, data);
  }

  /**
   * Soft-deletes an Articulo after verifying no ArticuloRutaPasada record references it.
   * Throws RestrictError if ANY pivot record exists, regardless of route active status.
   */
  override async softDelete(id: number): Promise<boolean> {
    const em = this.getEm();

    const pivotRefs = await em.count(ArticuloRutaPasada, { articulo: { id } });
    if (pivotRefs > 0) {
      throw new RestrictError(
        `Cannot delete articulo ${id}: ${pivotRefs} ruta(s) reference it`,
      );
    }

    return super.softDelete(id);
  }
}
