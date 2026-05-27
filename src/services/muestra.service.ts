import { BaseService } from './base.service.js';
import { Muestra, MuestraEstadoValidacion } from '../models/Muestra.js';
import { Pasada, PasadaEstado } from '../models/Pasada.js';
import { RutaPasadaEtapa } from '../models/RutaPasadaEtapa.js';
import { Usuario } from '../models/Usuario.js';
import { Articulo } from '../models/Articulo.js';
import { Etapa } from '../models/Etapa.js';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { sesionService } from './sesion.service.js';

export class MuestraService extends BaseService<Muestra> {
  constructor() {
    super(Muestra);
  }

  async registrarMuestra(
    usuarioId: number,
    articuloId: number,
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

    // 1. If pasadaId is provided, check if it's en_curso
    let pasada: Pasada | null = null;
    if (pasadaId) {
      pasada = await em.findOne(Pasada, { id: pasadaId });
      if (!pasada) {
        throw new Error(`Pasada with ID ${pasadaId} not found`);
      }
      if (pasada.estado === PasadaEstado.COMPLETA || pasada.estado === PasadaEstado.ABORTADA) {
        throw new Error(`Cannot register sample: Pasada is already completed or aborted`);
      }
    }

    // 2. Fetch RutaPasadaEtapa for limits validation
    const rutaEtapa = await em.findOne(RutaPasadaEtapa, {
      articulo: articuloId,
      etapa: etapaId,
    });
    if (!rutaEtapa) {
      throw new Error(`No route configuration found for article ${articuloId} and stage ${etapaId}`);
    }

    // 3. Enforce sequential stage order if in a Pasada
    if (pasada) {
      // Find all stages for this article, ordered by 'orden'
      const allRutas = await em.find(
        RutaPasadaEtapa,
        { articulo: articuloId },
        { orderBy: { orden: 'ASC' } }
      );

      // Verify that all preceding stages (lower orden) are complete
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
    muestra.pasada = pasada || undefined;
    muestra.usuario = em.getReference(Usuario, usuarioId);
    muestra.articulo = em.getReference(Articulo, articuloId);
    muestra.etapa = em.getReference(Etapa, etapaId);
    muestra.lineaProduccion = em.getReference(LineaProduccion, lineaProduccionId);
    muestra.pesoNeto = pesoNeto;
    muestra.estadoValidacion = estadoValidacion;
    muestra.observacion = observacion;
    muestra.timestamp = new Date();
    muestra.activo = true;

    em.persist(muestra);
    await em.flush();

    // 6. If OK sample is registered, check if the Pasada is now complete
    if (pasada && estadoValidacion === MuestraEstadoValidacion.OK) {
      const allRutas = await em.find(
        RutaPasadaEtapa,
        { articulo: articuloId },
        { orderBy: { orden: 'ASC' } }
      );

      let entirePasadaComplete = true;
      for (const r of allRutas) {
        const count = await em.count(Muestra, {
          pasada: pasadaId,
          etapa: r.etapa.id,
          estadoValidacion: MuestraEstadoValidacion.OK,
        });
        if (count < r.cantidadMuestrasRequeridas) {
          entirePasadaComplete = false;
          break;
        }
      }

      if (entirePasadaComplete) {
        pasada.estado = PasadaEstado.COMPLETA;
        pasada.horaCierre = new Date();
        await em.flush();

        // Clear from active memory session
        const session = sesionService.obtenerSesion(lineaProduccionId);
        if (session && session.pasadaId === pasada.id) {
          sesionService.actualizarPasada(lineaProduccionId, null);
        }
      }
    }

    return muestra;
  }

  override async update(id: number, data: Partial<Muestra>): Promise<Muestra | null> {
    const em = this.getEm();
    const muestra = await em.findOne(Muestra, { id }, { populate: ['pasada'] });
    if (!muestra) return null;

    if (muestra.pasada && (muestra.pasada.estado === PasadaEstado.COMPLETA || muestra.pasada.estado === PasadaEstado.ABORTADA)) {
      throw new Error('Cannot update sample of a completed or aborted pasada');
    }

    return super.update(id, data);
  }

  override async softDelete(id: number): Promise<boolean> {
    const em = this.getEm();
    const muestra = await em.findOne(Muestra, { id }, { populate: ['pasada'] });
    if (!muestra) return false;

    if (muestra.pasada && (muestra.pasada.estado === PasadaEstado.COMPLETA || muestra.pasada.estado === PasadaEstado.ABORTADA)) {
      throw new Error('Cannot delete sample of a completed or aborted pasada');
    }

    return super.softDelete(id);
  }
}
