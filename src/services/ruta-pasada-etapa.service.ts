import { BaseService } from './base.service.js';
import { RutaPasadaEtapa } from '../models/RutaPasadaEtapa.js';

export class RutaPasadaEtapaService extends BaseService<RutaPasadaEtapa> {
  constructor() {
    super(RutaPasadaEtapa);
  }

  override async findAll(rutaPasadaId?: number): Promise<RutaPasadaEtapa[]> {
    const where = rutaPasadaId
      ? { activo: true, rutaPasada: rutaPasadaId }
      : { activo: true };
    return this.getEm().find(RutaPasadaEtapa, where, { populate: ['etapa'] });
  }
}
