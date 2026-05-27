import { BaseService } from './base.service.js';
import { Articulo } from '../models/Articulo.js';
import { RutaPasadaEtapa } from '../models/RutaPasadaEtapa.js';
import { RestrictError } from '../utils/errors.js';

export { RestrictError } from '../utils/errors.js';

export class ArticuloService extends BaseService<Articulo> {
  constructor() {
    super(Articulo);
  }

  /**
   * Soft-deletes an Articulo after verifying no active RutaPasadaEtapa references it.
   * Throws RestrictError if active references exist.
   */
  override async softDelete(id: number): Promise<boolean> {
    const em = this.getEm();

    const activeRefs = await em.count(RutaPasadaEtapa, { articulo: { id } });
    if (activeRefs > 0) {
      throw new RestrictError(
        `Cannot delete articulo ${id}: ${activeRefs} active ruta(s) reference it`,
      );
    }

    return super.softDelete(id);
  }
}
