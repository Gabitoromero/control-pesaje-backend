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
    if (data.codigo && data.nombre !== undefined) {
      const existing = await em.findOne(Articulo, { codigo: data.codigo, nombre: data.nombre });
      if (existing) {
        throw new ValidationError(`Ya existe un artículo con el código '${data.codigo}' y el nombre '${data.nombre}'`);
      }
    }
    return super.create(data);
  }

  override async update(id: number, data: Partial<Articulo>): Promise<Articulo | null> {
    const em = this.getEm();
    
    if (data.codigo !== undefined || data.nombre !== undefined) {
      const current = await em.findOne(Articulo, { id });
      if (current) {
        const codigoToCheck = data.codigo !== undefined ? data.codigo : current.codigo;
        const nombreToCheck = data.nombre !== undefined ? data.nombre : current.nombre;
        
        const existing = await em.findOne(Articulo, { codigo: codigoToCheck, nombre: nombreToCheck });
        if (existing && existing.id !== id) {
          throw new ValidationError(`Ya existe un artículo con el código '${codigoToCheck}' y el nombre '${nombreToCheck}'`);
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
        `No se puede eliminar: este artículo está en uso en ${pivotRefs} ruta(s). Quitalo de esa(s) ruta(s) antes de eliminarlo.`,
      );
    }

    return super.softDelete(id);
  }
}
