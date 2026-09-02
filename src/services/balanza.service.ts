import { RequiredEntityData } from '@mikro-orm/core';
import { BaseService } from './base.service.js';
import { Balanza } from '../models/Balanza.js';
import { Pasada } from '../models/Pasada.js';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { RestrictError, ValidationError } from '../utils/errors.js';

export class BalanzaService extends BaseService<Balanza> {
  constructor() {
    super(Balanza);
  }

  override async create(data: RequiredEntityData<Balanza>): Promise<Balanza> {
    if (data.nombre) {
      const existing = await this.getEm().findOne(Balanza, { nombre: data.nombre });
      if (existing) {
        throw new ValidationError(`Ya existe una balanza con el nombre '${data.nombre}'`);
      }
    }
    return super.create(data);
  }

  override async update(id: number, data: Partial<Balanza>): Promise<Balanza | null> {
    if (data.nombre) {
      const existing = await this.getEm().findOne(Balanza, { nombre: data.nombre });
      if (existing && existing.id !== id) {
        throw new ValidationError(`Ya existe una balanza con el nombre '${data.nombre}'`);
      }
    }
    return super.update(id, data);
  }

  override async softDelete(id: number): Promise<boolean> {
    const em = this.getEm();

    const lineaRefs = await em.count(LineaProduccion, { balanza: id });
    if (lineaRefs > 0) {
      throw new RestrictError(
        `No se puede eliminar: esta balanza está asignada a ${lineaRefs} línea(s) de producción. Reasigná esa(s) línea(s) a otra balanza antes de eliminarla.`
      );
    }

    const pasadaRefs = await em.count(Pasada, { balanza: id });
    if (pasadaRefs > 0) {
      throw new RestrictError(
        `No se puede eliminar: esta balanza tiene ${pasadaRefs} pasada(s) registradas. Las balanzas usadas en pasadas se conservan para no perder el historial.`
      );
    }

    return super.softDelete(id);
  }
}
