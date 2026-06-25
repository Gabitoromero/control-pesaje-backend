import { BaseService } from './base.service.js';
import { Articulo } from '../models/Articulo.js';
import { ArticuloRutaPasada } from '../models/ArticuloRutaPasada.js';
import { RestrictError } from '../utils/errors.js';

export { RestrictError } from '../utils/errors.js';

export class ArticuloService extends BaseService<Articulo> {
  constructor() {
    super(Articulo);
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
