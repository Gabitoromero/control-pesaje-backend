import { BaseService } from './base.service.js';
import { Pasada, PasadaEstado } from '../models/Pasada.js';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { Articulo } from '../models/Articulo.js';
import { Usuario } from '../models/Usuario.js';
import { RutaPasada } from '../models/RutaPasada.js';
import { ArticuloRutaPasada } from '../models/ArticuloRutaPasada.js';
import { sesionService } from './sesion.service.js';
import { LockMode } from '@mikro-orm/core';

export class PasadaService extends BaseService<Pasada> {
  constructor() {
    super(Pasada);
  }

  async findAllPopulated(where?: Record<string, unknown>): Promise<Pasada[]> {
    return this.getEm().find(
      Pasada,
      { activo: true, ...where },
      { populate: ['usuario', 'lineaProduccion', 'articulo'] as const }
    );
  }

  async iniciarPasada(
    lineaProduccionId: number,
    articuloId: number,
    usuarioId: number
  ): Promise<Pasada> {
    const em = this.getEm();

    // Check if there is an active session for the line
    const session = sesionService.obtenerSesion(lineaProduccionId);
    if (!session) {
      throw new Error(`No hay una sesión activa en la línea de producción ${lineaProduccionId}`);
    }

    // Verify the session belongs to the initiating operator
    if (session.usuarioId !== usuarioId) {
      throw new Error(`El usuario ${usuarioId} no tiene una sesión activa en la línea de producción ${lineaProduccionId}`);
    }

    // Start database transaction
    return em.transactional(async (txEm) => {
      // Pessimistic write lock on the line to serialize pasada generation on this line
      const linea = await txEm.findOne(
        LineaProduccion,
        { id: lineaProduccionId },
        { lockMode: LockMode.PESSIMISTIC_WRITE, populate: ['rutaPasadaActiva'] }
      );
      if (!linea?.rutaPasadaActiva) {
        throw new Error(`No se puede iniciar la pasada: no hay una ruta activa en la línea de producción ${lineaProduccionId}`);
      }

      const isOnRoute = await txEm.count(ArticuloRutaPasada, {
        rutaPasada: linea.rutaPasadaActiva.id,
        articulo: articuloId,
      });
      if (isOnRoute === 0) {
        throw new Error(
          `El artículo ${articuloId} no pertenece a la ruta activa de la línea de producción ${lineaProduccionId}`
        );
      }

      // Fetch the last Pasada for this line and article to determine the next sequential number
      const lastPasada = await txEm.findOne(
        Pasada,
        { lineaProduccion: lineaProduccionId, articulo: articuloId },
        { filters: false, orderBy: { numero: 'DESC' } }
      );

      const nextNumero = lastPasada ? lastPasada.numero + 1 : 1;

      // Instantiate using references
      const lineaRef = txEm.getReference(LineaProduccion, lineaProduccionId);
      const rutaPasadaRef = txEm.getReference(RutaPasada, linea.rutaPasadaActiva.id);
      const articuloRef = txEm.getReference(Articulo, articuloId);
      const usuarioRef = txEm.getReference(Usuario, usuarioId);

      const pasada = new Pasada();
      pasada.lineaProduccion = lineaRef;
      pasada.rutaPasada = rutaPasadaRef;
      pasada.articulo = articuloRef;
      pasada.usuario = usuarioRef;
      pasada.numero = nextNumero;
      pasada.estado = PasadaEstado.EN_CURSO;
      pasada.horaInicio = new Date();
      pasada.activo = true;

      txEm.persist(pasada);
      await txEm.flush();

      // Update in-memory session with the new pasadaId
      sesionService.actualizarPasada(lineaProduccionId, pasada.id);

      return pasada;
    });
  }

  async completarPasada(id: number): Promise<Pasada | null> {
    const em = this.getEm();

    return em.transactional(async (txEm) => {
      const pasada = await txEm.findOne(Pasada, { id }, { lockMode: LockMode.PESSIMISTIC_WRITE });
      if (!pasada) return null;

      if (pasada.estado === PasadaEstado.COMPLETA) {
        return pasada;
      }

      if (pasada.estado !== PasadaEstado.EN_CURSO) {
        throw new Error(`No se puede completar la pasada con ID ${id}: ya está en estado '${pasada.estado}'`);
      }

      pasada.estado = PasadaEstado.COMPLETA;
      pasada.horaCierre = new Date();
      await txEm.flush();

      // Clear from in-memory session if it matches
      const lineId = pasada.lineaProduccion.id;
      const session = sesionService.obtenerSesion(lineId);
      if (session && session.pasadaId === pasada.id) {
        sesionService.actualizarPasada(lineId, null);
      }

      return pasada;
    });
  }

  async abortarPasada(id: number, motivoCierre: string): Promise<Pasada | null> {
    if (!motivoCierre || motivoCierre.trim() === '') {
      throw new Error('Se requiere un motivo de cierre para abortar una pasada');
    }

    const em = this.getEm();

    return em.transactional(async (txEm) => {
      const pasada = await txEm.findOne(Pasada, { id }, { lockMode: LockMode.PESSIMISTIC_WRITE });
      if (!pasada) return null;

      if (pasada.estado !== PasadaEstado.EN_CURSO) {
        throw new Error(`No se puede abortar la pasada con ID ${id}: ya está en estado '${pasada.estado}'`);
      }

      pasada.estado = PasadaEstado.ABORTADA;
      pasada.motivoCierre = motivoCierre;
      pasada.horaCierre = new Date();
      await txEm.flush();

      const lineId = pasada.lineaProduccion.id;
      const session = sesionService.obtenerSesion(lineId);
      if (session?.pasadaId === pasada.id) {
        sesionService.actualizarPasada(lineId, null);
      }

      return pasada;
    });
  }

  override async update(id: number, data: Partial<Pasada>): Promise<Pasada | null> {
    const pasada = await this.findById(id);
    if (!pasada) return null;

    if (pasada.estado === PasadaEstado.COMPLETA || pasada.estado === PasadaEstado.ABORTADA) {
      throw new Error('No se puede actualizar una pasada completada o abortada');
    }

    return super.update(id, data);
  }

  override async softDelete(id: number): Promise<boolean> {
    const pasada = await this.findById(id);
    if (!pasada) return false;

    if (pasada.estado === PasadaEstado.COMPLETA || pasada.estado === PasadaEstado.ABORTADA) {
      throw new Error('No se puede eliminar una pasada completada o abortada');
    }

    return super.softDelete(id);
  }
}
