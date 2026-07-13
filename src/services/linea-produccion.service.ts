import { BaseService } from './base.service.js';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { RutaPasada } from '../models/RutaPasada.js';
import { Pasada, PasadaEstado } from '../models/Pasada.js';
import { ValidationError } from '../utils/errors.js';
import { RequiredEntityData } from '@mikro-orm/core';

const LINEA_POPULATE = [
  'rutaPasadaActiva',
  'rutaPasadaActiva.etapas',
  'rutaPasadaActiva.etapas.etapa',
  'dispositivo',
] as const;

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
    if (data.nombre) {
      const existing = await this.getEm().findOne(LineaProduccion, { nombre: data.nombre });
      if (existing) {
        throw new ValidationError(`LineaProduccion with nombre '${data.nombre}' already exists`);
      }
    }
    if (data.rutaPasadaActiva !== undefined && data.rutaPasadaActiva !== null) {
      await this.validateRutaPasadaActiva(data.rutaPasadaActiva);
    }
    return super.create(data);
  }

  override async update(id: number, data: Partial<LineaProduccion>): Promise<LineaProduccion | null> {
    const em = this.getEm();

    if (data.nombre) {
      const existing = await em.findOne(LineaProduccion, { nombre: data.nombre });
      if (existing && existing.id !== id) {
        throw new ValidationError(`LineaProduccion with nombre '${data.nombre}' already exists`);
      }
    }

    if (data.rutaPasadaActiva !== undefined) {
      const linea = await em.findOne(LineaProduccion, { id });
      
      if (linea) {
        const currentRutaId = linea.rutaPasadaActiva?.id;
        let newRutaId: number | undefined;
        
        if (typeof data.rutaPasadaActiva === 'number') {
          newRutaId = data.rutaPasadaActiva;
        } else if (typeof data.rutaPasadaActiva === 'object' && data.rutaPasadaActiva !== null && 'id' in data.rutaPasadaActiva) {
          newRutaId = (data.rutaPasadaActiva as RutaPasada).id;
        } else if (data.rutaPasadaActiva === null) {
          newRutaId = undefined; // Treating null as clearing the route
        }

        if (currentRutaId !== newRutaId) {
          const activePasadasCount = await em.count(Pasada, { lineaProduccion: id, estado: PasadaEstado.EN_CURSO });
          if (activePasadasCount > 0) {
            throw new ValidationError('No se puede cambiar la ruta mientras haya pasadas en curso en esta línea');
          }
        }
      }

      if (data.rutaPasadaActiva !== null) {
        await this.validateRutaPasadaActiva(data.rutaPasadaActiva);
      }
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

