import { BaseService } from './base.service.js';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { RutaPasada } from '../models/RutaPasada.js';
import { ValidationError } from '../utils/errors.js';
import { RequiredEntityData } from '@mikro-orm/core';

const LINEA_POPULATE = ['rutaPasadaActiva', 'rutaPasadaActiva.etapas', 'rutaPasadaActiva.etapas.etapa'] as const;

export class LineaProduccionService extends BaseService<LineaProduccion> {
  constructor() {
    super(LineaProduccion);
  }

  override async findAll(): Promise<LineaProduccion[]> {
    return this.getEm().find(LineaProduccion, { activo: true }, { populate: LINEA_POPULATE });
  }

  override async findAllInactive(): Promise<LineaProduccion[]> {
    return this.getEm().find(LineaProduccion, { activo: false }, { populate: LINEA_POPULATE });
  }

  override async findById(id: number): Promise<LineaProduccion | null> {
    return this.getEm().findOne(LineaProduccion, { id }, { populate: LINEA_POPULATE });
  }

  override async create(data: RequiredEntityData<LineaProduccion>): Promise<LineaProduccion> {
    if (data.rutaPasadaActiva !== undefined && data.rutaPasadaActiva !== null) {
      await this.validateRutaPasadaActiva(data.rutaPasadaActiva);
    }
    return super.create(data);
  }

  override async update(id: number, data: Partial<LineaProduccion>): Promise<LineaProduccion | null> {
    if (data.rutaPasadaActiva !== undefined && data.rutaPasadaActiva !== null) {
      await this.validateRutaPasadaActiva(data.rutaPasadaActiva);
    }
    return super.update(id, data);
  }

  private async validateRutaPasadaActiva(ruta: unknown): Promise<void> {
    let id: number | undefined;
    if (typeof ruta === 'number') {
      id = ruta;
    } else if (typeof ruta === 'object' && ruta !== null && 'id' in ruta) {
      id = (ruta as RutaPasada).id;
    }

    if (id === undefined) {
      return;
    }

    const em = this.getEm();
    const rutaEntity = await em.findOne(RutaPasada, { id, activo: true }, { populate: ['etapas'] });
    if (!rutaEntity) {
      throw new ValidationError('La ruta especificada no existe o no está activa');
    }

    if (rutaEntity.etapas.length === 0) {
      throw new ValidationError('No se puede asignar una ruta sin etapas a una línea de producción');
    }
  }
}

