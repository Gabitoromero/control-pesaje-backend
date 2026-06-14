import { BaseService } from './base.service.js';
import { RutaPasada } from '../models/RutaPasada.js';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { RestrictError } from '../utils/errors.js';

export class RutaPasadaService extends BaseService<RutaPasada> {
  constructor() {
    super(RutaPasada);
  }

  override async softDelete(id: number): Promise<boolean> {
    const em = this.getEm();

    const activeRefs = await em.count(LineaProduccion, { rutaPasadaActiva: { id }, activo: true });
    if (activeRefs > 0) {
      throw new RestrictError(
        `No se puede eliminar la ruta: ${activeRefs} línea(s) activa(s) la tienen asignada`,
      );
    }

    return super.softDelete(id);
  }
}
