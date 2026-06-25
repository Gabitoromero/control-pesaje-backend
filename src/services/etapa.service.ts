import { BaseService } from './base.service.js';
import { Etapa } from '../models/Etapa.js';
import { RutaPasadaEtapa } from '../models/RutaPasadaEtapa.js';
import { RestrictError } from '../utils/errors.js';

export class EtapaService extends BaseService<Etapa> {
  constructor() {
    super(Etapa);
  }

  /**
   * Soft-deletes an Etapa after verifying no RutaPasadaEtapa record references it.
   * Throws RestrictError if ANY pivot record exists, regardless of route active status.
   */
  override async softDelete(id: number): Promise<boolean> {
    const em = this.getEm();

    const pivotRefs = await em.count(RutaPasadaEtapa, { etapa: { id } });
    if (pivotRefs > 0) {
      throw new RestrictError(
        `Cannot delete etapa ${id}: ${pivotRefs} ruta(s) reference it`,
      );
    }

    return super.softDelete(id);
  }
}
