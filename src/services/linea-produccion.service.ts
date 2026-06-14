import { BaseService } from './base.service.js';
import { LineaProduccion } from '../models/LineaProduccion.js';

export class LineaProduccionService extends BaseService<LineaProduccion> {
  constructor() {
    super(LineaProduccion);
  }

  override async findAll(): Promise<LineaProduccion[]> {
    return this.getEm().find(LineaProduccion, { activo: true }, { populate: ['rutaPasadaActiva'] });
  }

  override async findAllInactive(): Promise<LineaProduccion[]> {
    return this.getEm().find(LineaProduccion, { activo: false }, { populate: ['rutaPasadaActiva'] });
  }
}
