import { BaseService } from './base.service.js';
import { Pasada, PasadaEstado } from '../models/Pasada.js';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { Articulo } from '../models/Articulo.js';
import { Marca } from '../models/Marca.js';
import { Usuario } from '../models/Usuario.js';
import { sesionService } from './sesion.service.js';
import { LockMode } from '@mikro-orm/core';

export class PasadaService extends BaseService<Pasada> {
  constructor() {
    super(Pasada);
  }

  async iniciarPasada(
    lineaProduccionId: number,
    articuloId: number,
    usuarioId: number,
    marcaId?: number
  ): Promise<Pasada> {
    const em = this.getEm();

    // Check if there is an active session for the line
    const session = sesionService.obtenerSesion(lineaProduccionId);
    if (!session) {
      throw new Error(`No active session on production line ${lineaProduccionId}`);
    }

    // Verify the session belongs to the initiating operator and article
    if (session.usuarioId !== usuarioId) {
      throw new Error(`User ${usuarioId} does not have an active session on production line ${lineaProduccionId}`);
    }
    if (session.articuloId !== articuloId) {
      throw new Error(`Active session on line ${lineaProduccionId} is for article ${session.articuloId}, not ${articuloId}`);
    }

    // Start database transaction
    return em.transactional(async (txEm) => {
      // Pessimistic write lock on the line to serialize pasada generation on this line
      await txEm.findOne(LineaProduccion, { id: lineaProduccionId }, { lockMode: LockMode.PESSIMISTIC_WRITE });

      // Fetch the last Pasada for this line and article to determine the next sequential number
      const lastPasada = await txEm.findOne(
        Pasada,
        { lineaProduccion: lineaProduccionId, articulo: articuloId },
        { filters: false, orderBy: { numero: 'DESC' } }
      );

      const nextNumero = lastPasada ? lastPasada.numero + 1 : 1;

      // Instantiate using references
      const lineaRef = txEm.getReference(LineaProduccion, lineaProduccionId);
      const articuloRef = txEm.getReference(Articulo, articuloId);
      const usuarioRef = txEm.getReference(Usuario, usuarioId);
      const marcaRef = marcaId ? txEm.getReference(Marca, marcaId) : undefined;

      const pasada = new Pasada();
      pasada.lineaProduccion = lineaRef;
      pasada.articulo = articuloRef;
      pasada.usuario = usuarioRef;
      pasada.marca = marcaRef;
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

      if (pasada.estado !== PasadaEstado.EN_CURSO) {
        throw new Error(`Cannot complete pasada with ID ${id}: it is already in state '${pasada.estado}'`);
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
      throw new Error('Closure reason (motivoCierre) is required to abort a pasada');
    }

    const em = this.getEm();
    const pasada = await this.findById(id);
    if (!pasada) return null;

    if (pasada.estado !== PasadaEstado.EN_CURSO) {
      throw new Error(`Cannot abort pasada with ID ${id}: it is already in state '${pasada.estado}'`);
    }

    pasada.estado = PasadaEstado.ABORTADA;
    pasada.motivoCierre = motivoCierre;
    pasada.horaCierre = new Date();
    await em.flush();

    // Clear from in-memory session if it matches
    const lineId = pasada.lineaProduccion.id;
    const session = sesionService.obtenerSesion(lineId);
    if (session && session.pasadaId === pasada.id) {
      sesionService.actualizarPasada(lineId, null);
    }

    return pasada;
  }

  override async update(id: number, data: Partial<Pasada>): Promise<Pasada | null> {
    const pasada = await this.findById(id);
    if (!pasada) return null;

    if (pasada.estado === PasadaEstado.COMPLETA || pasada.estado === PasadaEstado.ABORTADA) {
      throw new Error('Cannot update a completed or aborted pasada');
    }

    return super.update(id, data);
  }

  override async softDelete(id: number): Promise<boolean> {
    const pasada = await this.findById(id);
    if (!pasada) return false;

    if (pasada.estado === PasadaEstado.COMPLETA || pasada.estado === PasadaEstado.ABORTADA) {
      throw new Error('Cannot delete a completed or aborted pasada');
    }

    return super.softDelete(id);
  }
}
