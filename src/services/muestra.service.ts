import { RequestContext } from '@mikro-orm/core';
import { Muestra, MuestraEstadoValidacion } from '../models/Muestra.js';
import { Pasada, PasadaEstado } from '../models/Pasada.js';
import { RutaPasadaEtapa } from '../models/RutaPasadaEtapa.js';
import { RutaPasada } from '../models/RutaPasada.js';
import { Usuario } from '../models/Usuario.js';
import { Articulo } from '../models/Articulo.js';
import { Etapa } from '../models/Etapa.js';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { sesionService } from './sesion.service.js';

export class MuestraService {
  private getEm() {
    const em = RequestContext.getEntityManager();
    if (!em) throw new Error('No EntityManager in RequestContext');
    return em;
  }

  async registrarMuestra(
    usuarioId: number,
    articuloId: number | undefined,
    etapaId: number,
    lineaProduccionId: number,
    pesoNeto: number,
    pasadaId?: number,
    observacion?: string
  ): Promise<Muestra> {
    // 0. Discard if no active session on the production line (Critical Business Logic #1)
    const activeSession = sesionService.obtenerSesion(lineaProduccionId);
    if (!activeSession) {
      throw new Error(`No active session on production line ${lineaProduccionId} — weight data discarded`);
    }

    const em = this.getEm();

    // 1. Resolve rutaPasadaId from active pasada or from the line's active route
    let rutaPasadaId: number;
    let pasada: Pasada | null = null;
    let allRutas: RutaPasadaEtapa[] = [];

    if (pasadaId) {
      pasada = await em.findOne(Pasada, pasadaId, { populate: ['rutaPasada', 'usuario'] });
      if (!pasada) {
        throw new Error(`Pasada with ID ${pasadaId} not found`);
      }
      if (pasada.usuario.id !== usuarioId) {
        throw new Error(`User ${usuarioId} cannot register samples on pasada ${pasadaId}: not the owner`);
      }
      if (pasada.estado === PasadaEstado.COMPLETA || pasada.estado === PasadaEstado.ABORTADA) {
        throw new Error(`Cannot register sample: Pasada is already completed or aborted`);
      }
      rutaPasadaId = pasada.rutaPasada.id;
    } else {
      const usuarioQueRegistra = await em.findOne(Usuario, { id: usuarioId, activo: true });
      if (!usuarioQueRegistra) {
        throw new Error(`User ${usuarioId} not found or inactive`);
      }
      if (!usuarioQueRegistra.puedeTomarMuestrasLibres) {
        throw new Error(`User ${usuarioId} is not authorized to register free samples`);
      }

      const linea = await em.findOne(LineaProduccion, { id: lineaProduccionId, activo: true }, { populate: ['rutaPasadaActiva'] });
      if (!linea?.rutaPasadaActiva) {
        throw new Error(
          `Cannot register samples on production line ${lineaProduccionId}: no active route assigned (setup mode)`
        );
      }
      rutaPasadaId = linea.rutaPasadaActiva.id;
    }

    // 2. Fetch RutaPasadaEtapa for limits validation
    const rutaEtapa = await em.findOne(RutaPasadaEtapa, {
      rutaPasada: rutaPasadaId,
      etapa: etapaId,
    });
    if (!rutaEtapa) {
      throw new Error(`No route configuration found for route ${rutaPasadaId} and stage ${etapaId}`);
    }

    // 3. Enforce sequential stage order if in a Pasada
    if (pasada) {
      allRutas = await em.find(
        RutaPasadaEtapa,
        { rutaPasada: rutaPasadaId },
        { orderBy: { orden: 'ASC' } }
      );

      for (const r of allRutas) {
        if (r.orden < rutaEtapa.orden) {
          const count = await em.count(Muestra, {
            pasada: pasadaId,
            etapa: r.etapa.id,
            estadoValidacion: MuestraEstadoValidacion.OK,
          });
          if (count < r.cantidadMuestrasRequeridas) {
            throw new Error(`Preceding stage '${r.etapa.id}' is not complete (progress: ${count}/${r.cantidadMuestrasRequeridas})`);
          }
        }
      }
    }

    // 4. Validate weight against limits
    const min = Number(rutaEtapa.pesoMinimo);
    const max = Number(rutaEtapa.pesoMaximo);
    const isOk = pesoNeto >= min && pesoNeto <= max;
    const estadoValidacion = isOk ? MuestraEstadoValidacion.OK : MuestraEstadoValidacion.FUERA_DE_RANGO;

    // 5. Build and persist Muestra
    const muestra = new Muestra();
    muestra.pasada = pasada ?? undefined;
    muestra.usuario = em.getReference(Usuario, usuarioId);
    muestra.rutaPasada = em.getReference(RutaPasada, rutaPasadaId);
    muestra.articulo = articuloId ? em.getReference(Articulo, articuloId) : undefined;
    muestra.etapa = em.getReference(Etapa, etapaId);
    muestra.lineaProduccion = em.getReference(LineaProduccion, lineaProduccionId);
    muestra.pesoNeto = pesoNeto;
    muestra.estadoValidacion = estadoValidacion;
    muestra.observacion = observacion;
    muestra.timestamp = new Date();

    em.persist(muestra);
    await em.flush();

    // 6. Return the new sample. Pasada completion is now triggered explicitly by the user from the frontend.
    return muestra;
  }

  async findAll(where?: Record<string, unknown>): Promise<Muestra[]> {
    return this.getEm().find(Muestra, where ?? {});
  }

  async findById(id: number): Promise<Muestra | null> {
    return this.getEm().findOne(Muestra, { id });
  }

  async update(id: number, data: Partial<Muestra>): Promise<Muestra | null> {
    const em = this.getEm();
    const muestra = await em.findOne(Muestra, { id }, { populate: ['pasada'] });
    if (!muestra) return null;

    if (muestra.pasada && (muestra.pasada.estado === PasadaEstado.COMPLETA || muestra.pasada.estado === PasadaEstado.ABORTADA)) {
      throw new Error('Cannot update sample of a completed or aborted pasada');
    }

    Object.assign(muestra, data);
    await em.flush();
    return muestra;
  }

  /**
   * Physically deletes a muestra row from the database (hard delete).
   * This is the only entity in the project that deviates from the global soft-delete rule.
   * Returns true if the muestra was found and deleted, false if it did not exist.
   */
  async hardDelete(id: number): Promise<boolean> {
    const em = this.getEm();
    const muestra = await em.findOne(Muestra, { id }, { populate: ['pasada'] });
    if (!muestra) return false;

    if (muestra.pasada && (muestra.pasada.estado === PasadaEstado.COMPLETA || muestra.pasada.estado === PasadaEstado.ABORTADA)) {
      throw new Error('Cannot delete sample of a completed or aborted pasada');
    }

    await em.remove(muestra);
    await em.flush();
    return true;
  }
}
