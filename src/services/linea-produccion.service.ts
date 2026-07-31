import { BaseService } from './base.service.js';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { RutaPasada } from '../models/RutaPasada.js';
import { Pasada, PasadaEstado } from '../models/Pasada.js';
import { ValidationError } from '../utils/errors.js';
import { RequiredEntityData } from '@mikro-orm/core';
import { Balanza } from '../models/Balanza.js';
import { Articulo } from '../models/Articulo.js';

const LINEA_POPULATE = [
  'rutaPasadaActiva',
  'rutaPasadaActiva.etapas',
  'rutaPasadaActiva.etapas.etapa',
  'dispositivo',
  'balanza',
  'articulo',
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

  override async create(data: RequiredEntityData<LineaProduccion> & { idBalanza?: number; articuloId?: number }): Promise<LineaProduccion> {
    const em = this.getEm();
    if (data.nombre) {
      const existing = await em.findOne(LineaProduccion, { nombre: data.nombre });
      if (existing) {
        throw new ValidationError(`LineaProduccion with nombre '${data.nombre}' already exists`);
      }
    }
    if (data.rutaPasadaActiva !== undefined && data.rutaPasadaActiva !== null) {
      await this.validateRutaPasadaActiva(data.rutaPasadaActiva);
    }

    const { idBalanza, articuloId, ...rest } = data;
    if (!idBalanza) {
      throw new ValidationError('El campo idBalanza es requerido');
    }
    if (!articuloId) {
      throw new ValidationError('El campo articuloId es requerido');
    }

    const balanza = await em.findOne(Balanza, { id: idBalanza });
    if (!balanza) {
      throw new ValidationError(`La balanza con ID ${idBalanza} no existe`);
    }

    const articulo = await em.findOne(Articulo, { id: articuloId });
    if (!articulo) {
      throw new ValidationError(`El artículo con ID ${articuloId} no existe`);
    }

    const finalData: RequiredEntityData<LineaProduccion> = {
      nombre: rest.nombre ?? '',
      rutaPasadaActiva: rest.rutaPasadaActiva,
      activo: rest.activo ?? true,
      rutaAsignadaAt: rest.rutaAsignadaAt,
      balanza: em.getReference(Balanza, idBalanza),
      articulo: em.getReference(Articulo, articuloId),
    };

    return super.create(finalData);
  }

  override async update(id: number, data: Partial<LineaProduccion> & { idBalanza?: number; articuloId?: number }): Promise<LineaProduccion | null> {
    const em = this.getEm();

    if (data.nombre) {
      const existing = await em.findOne(LineaProduccion, { nombre: data.nombre });
      if (existing && existing.id !== id) {
        throw new ValidationError(`LineaProduccion with nombre '${data.nombre}' already exists`);
      }
    }

    const { idBalanza, articuloId, ...rest } = data;
    const updateData: Partial<LineaProduccion> = { ...rest };

    if (idBalanza !== undefined) {
      if (idBalanza === null) {
        throw new ValidationError('El campo idBalanza no puede ser nulo');
      }
      const balanza = await em.findOne(Balanza, { id: idBalanza });
      if (!balanza) {
        throw new ValidationError(`La balanza con ID ${idBalanza} no existe`);
      }
      updateData.balanza = em.getReference(Balanza, idBalanza);
    }

    if (articuloId !== undefined) {
      if (articuloId === null) {
        throw new ValidationError('El campo articuloId no puede ser nulo');
      }
      const articulo = await em.findOne(Articulo, { id: articuloId });
      if (!articulo) {
        throw new ValidationError(`El artículo con ID ${articuloId} no existe`);
      }
      updateData.articulo = em.getReference(Articulo, articuloId);
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
          newRutaId = undefined;
        }

        if (currentRutaId !== newRutaId) {
          const activePasadasCount = await em.count(Pasada, { lineaProduccion: id, estado: PasadaEstado.EN_CURSO });
          if (activePasadasCount > 0) {
            throw new ValidationError('No se puede cambiar la ruta mientras haya pasadas en curso en esta línea');
          }
          // Stamp the exact moment the route changed — used as x1 anchor for dashboard KPIs
          updateData.rutaAsignadaAt = new Date();
        }
      }

      if (data.rutaPasadaActiva !== null) {
        await this.validateRutaPasadaActiva(data.rutaPasadaActiva);
      }
    }
    return super.update(id, updateData);
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

