import { BaseService } from './base.service.js';
import { Etapa } from '../models/Etapa.js';
import { RutaPasadaEtapa } from '../models/RutaPasadaEtapa.js';
import { RestrictError, ValidationError } from '../utils/errors.js';
import { RequiredEntityData } from '@mikro-orm/core';

export class EtapaService extends BaseService<Etapa> {
  constructor() {
    super(Etapa);
  }

  override async create(data: RequiredEntityData<Etapa>): Promise<Etapa> {
    if (data.nombre) {
      const existing = await this.getEm().findOne(Etapa, { nombre: data.nombre });
      if (existing) {
        throw new ValidationError(`Ya existe una etapa con el nombre '${data.nombre}'`);
      }
    }
    return super.create(data);
  }

  override async update(id: number, data: Partial<Etapa>): Promise<Etapa | null> {
    if (data.nombre) {
      const existing = await this.getEm().findOne(Etapa, { nombre: data.nombre });
      if (existing && existing.id !== id) {
        throw new ValidationError(`Ya existe una etapa con el nombre '${data.nombre}'`);
      }
    }
    return super.update(id, data);
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
