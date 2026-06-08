import { BaseService } from './base.service.js';
import { Etapa } from '../models/Etapa.js';
import { RutaPasadaEtapa } from '../models/RutaPasadaEtapa.js';
import { RestrictError } from '../utils/errors.js';

export class EtapaService extends BaseService<Etapa> {
  constructor() {
    super(Etapa);
  }

  /**
   * Soft-deletes an Etapa after verifying no active RutaPasadaEtapa references it.
   * Throws RestrictError if active references exist.
   */
  override async softDelete(id: number): Promise<boolean> {
    const em = this.getEm();

    const activeRefs = await em.count(RutaPasadaEtapa, { etapa: { id }, activo: true });
    if (activeRefs > 0) {
      throw new RestrictError(
        `Cannot delete etapa ${id}: ${activeRefs} active ruta(s) reference it`,
      );
    }

    return super.softDelete(id);
  }
}
