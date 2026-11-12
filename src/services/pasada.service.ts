import { BaseService } from './base.service.js';
import { Pasada, PasadaEstado } from '../models/Pasada.js';
import { LineaProduccion } from '../models/LineaProduccion.js';
import { Articulo } from '../models/Articulo.js';
import { Usuario } from '../models/Usuario.js';
import { RutaPasada } from '../models/RutaPasada.js';
import { ArticuloRutaPasada } from '../models/ArticuloRutaPasada.js';
import { sesionService } from './sesion.service.js';
import { Balanza } from '../models/Balanza.js';
import { LockMode } from '@mikro-orm/core';
import {
  esArticuloVerificacion,
  evaluarBalanzaParaProducir,
  registrarVerificacionCompletada,
  resolverRutaVerificacion,
  listarRutasVerificacion,
} from './verificacion-balanza.service.js';

export class PasadaService extends BaseService<Pasada> {
  constructor() {
    super(Pasada);
  }

  async findAllPopulated(where?: Record<string, unknown>): Promise<Pasada[]> {
    return this.getEm().find(
      Pasada,
      { activo: true, ...where },
      { populate: ['usuario', 'lineaProduccion', 'articulo', 'balanza'] as const }
    );
  }

  async listarRutasVerificacion(): Promise<RutaPasada[]> {
    return listarRutasVerificacion(this.getEm());
  }

  async iniciarPasada(
    lineaProduccionId: number,
    idBalanza: number,
    usuarioId: number,
    observacion?: string,
    // Explicit request to start the verification route (standard weights, articulo code 0) from any line.
    verificacion = false,
    // Which verification route to run; only meaningful with `verificacion`.
    rutaVerificacionId?: number
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
    const resultado = await em.transactional(async (txEm) => {
      // Pessimistic write lock on the line to serialize pasada generation on this line
      const linea = await txEm.findOne(
        LineaProduccion,
        { id: lineaProduccionId },
        { lockMode: LockMode.PESSIMISTIC_WRITE, populate: ['rutaPasadaActiva', 'articulo'] }
      );
      const verif = verificacion ? await resolverRutaVerificacion(txEm, rutaVerificacionId) : null;
      if (verificacion && !verif) {
        throw new Error(
          rutaVerificacionId !== undefined
            ? 'La ruta seleccionada no es una ruta de verificación activa'
            : 'No se encontró la ruta de verificación (artículo con código 0)'
        );
      }
      if (verif && !linea) {
        throw new Error(`La línea de producción ${lineaProduccionId} no existe`);
      }
      if (!verif && !linea?.rutaPasadaActiva) {
        throw new Error(`No se puede iniciar la pasada: no hay una ruta activa en la línea de producción ${lineaProduccionId}`);
      }
      if (!verif && !linea!.articulo) {
        throw new Error(`No se puede iniciar la pasada: la línea de producción no tiene un artículo configurado`);
      }
      // Effective ruta / articulo: the verification ones when explicitly requested, the line's otherwise.
      const rutaEfectiva = verif ? verif.rutaPasada : linea!.rutaPasadaActiva!;
      const articuloEfectivo = verif ? verif.articulo : linea!.articulo;

      const balanza = await txEm.findOne(Balanza, { id: idBalanza }, { lockMode: LockMode.PESSIMISTIC_WRITE });
      if (!balanza) {
        throw new Error(`La balanza con ID ${idBalanza} no existe`);
      }
      if (!balanza.activo) {
        throw new Error(`La balanza con ID ${idBalanza} no está activa`);
      }

      const articuloId = articuloEfectivo.id;

      const isOnRoute = await txEm.count(ArticuloRutaPasada, {
        rutaPasada: rutaEfectiva.id,
        articulo: articuloId,
      });
      if (isOnRoute === 0) {
        throw new Error(
          `El artículo ${articuloId} no pertenece a la ruta activa de la línea de producción ${lineaProduccionId}`
        );
      }

      // Verification rule: a balanza with a different (or no) last article must be verified first.
      const bloqueo = await evaluarBalanzaParaProducir(txEm, balanza, articuloEfectivo);
      if (bloqueo) {
        // Persist the flag before rejecting; the error is thrown once the transaction is committed.
        await txEm.flush();
        return { bloqueo };
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
      const rutaPasadaRef = txEm.getReference(RutaPasada, rutaEfectiva.id);
      const articuloRef = txEm.getReference(Articulo, articuloId);
      const balanzaRef = txEm.getReference(Balanza, idBalanza);
      const usuarioRef = txEm.getReference(Usuario, usuarioId);

      const pasada = new Pasada();
      pasada.lineaProduccion = lineaRef;
      pasada.rutaPasada = rutaPasadaRef;
      pasada.articulo = articuloRef;
      pasada.balanza = balanzaRef;
      pasada.usuario = usuarioRef;
      pasada.numero = nextNumero;
      pasada.estado = PasadaEstado.EN_CURSO;
      pasada.horaInicio = new Date();
      pasada.activo = true;
      pasada.observacion = observacion ?? null;

      txEm.persist(pasada);
      await txEm.flush();

      // Update in-memory session with the new pasadaId
      sesionService.actualizarPasada(lineaProduccionId, pasada.id);

      return { pasada };
    });

    if ('bloqueo' in resultado) {
      throw new Error(resultado.bloqueo);
    }
    return resultado.pasada;
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

      // Completing a verification pasada (articulo code 0) lowers the balanza flag. Aborted ones never get here.
      const articuloPasada = await txEm.findOne(Articulo, { id: pasada.articulo.id });
      if (articuloPasada && esArticuloVerificacion(articuloPasada)) {
        const lineaPasada = await txEm.findOne(
          LineaProduccion,
          { id: pasada.lineaProduccion.id },
          { populate: ['articulo'] }
        );
        await registrarVerificacionCompletada(
          txEm,
          pasada.balanza.id,
          articuloPasada,
          lineaPasada?.articulo ?? null
        );
      }
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

  /**
   * Records that the line was stopped. If a pasada is running on the line it becomes `parada`
   * and is closed; otherwise a new pasada is registered directly as `parada` (no samples).
   * Unlike iniciarPasada it needs no session; the balanza defaults to the line's own one.
   */
  async registrarLineaParada(
    lineaProduccionId: number,
    usuarioId: number,
    observacion: string,
    idBalanza?: number
  ): Promise<Pasada> {
    if (!observacion || observacion.trim() === '') {
      throw new Error('Se requiere una observación para registrar la línea parada');
    }
    const motivo = observacion.trim();

    const em = this.getEm();

    return em.transactional(async (txEm) => {
      const linea = await txEm.findOne(
        LineaProduccion,
        { id: lineaProduccionId },
        { lockMode: LockMode.PESSIMISTIC_WRITE, populate: ['rutaPasadaActiva', 'articulo', 'balanza'] }
      );
      if (!linea) {
        throw new Error(`La línea de producción ${lineaProduccionId} no existe`);
      }

      const enCurso = await txEm.findOne(
        Pasada,
        { lineaProduccion: lineaProduccionId, estado: PasadaEstado.EN_CURSO, activo: true },
        { orderBy: { id: 'DESC' } }
      );

      const ahora = new Date();

      if (enCurso) {
        enCurso.estado = PasadaEstado.PARADA;
        enCurso.motivoCierre = motivo;
        enCurso.horaCierre = ahora;
        await txEm.flush();

        const session = sesionService.obtenerSesion(lineaProduccionId);
        if (session?.pasadaId === enCurso.id) {
          sesionService.actualizarPasada(lineaProduccionId, null);
        }
        return enCurso;
      }

      if (!linea.rutaPasadaActiva) {
        throw new Error(`No se puede registrar la línea parada: no hay una ruta activa en la línea de producción ${lineaProduccionId}`);
      }
      if (!linea.articulo) {
        throw new Error('No se puede registrar la línea parada: la línea de producción no tiene un artículo configurado');
      }

      let balanzaId = idBalanza ?? linea.balanza?.id;
      if (balanzaId === undefined) {
        throw new Error('No se puede registrar la línea parada: la línea de producción no tiene una balanza configurada');
      }
      const balanza = await txEm.findOne(Balanza, { id: balanzaId });
      if (!balanza) {
        throw new Error(`La balanza con ID ${balanzaId} no existe`);
      }
      balanzaId = balanza.id;

      const articuloId = linea.articulo.id;
      const lastPasada = await txEm.findOne(
        Pasada,
        { lineaProduccion: lineaProduccionId, articulo: articuloId },
        { filters: false, orderBy: { numero: 'DESC' } }
      );

      const pasada = new Pasada();
      pasada.lineaProduccion = txEm.getReference(LineaProduccion, lineaProduccionId);
      pasada.rutaPasada = txEm.getReference(RutaPasada, linea.rutaPasadaActiva.id);
      pasada.articulo = txEm.getReference(Articulo, articuloId);
      pasada.balanza = txEm.getReference(Balanza, balanzaId);
      pasada.usuario = txEm.getReference(Usuario, usuarioId);
      pasada.numero = lastPasada ? lastPasada.numero + 1 : 1;
      pasada.estado = PasadaEstado.PARADA;
      pasada.horaInicio = ahora;
      pasada.horaCierre = ahora;
      pasada.motivoCierre = motivo;
      pasada.activo = true;

      txEm.persist(pasada);
      await txEm.flush();
      return pasada;
    });
  }

  // Fields that stay editable after the pasada is closed (completa/abortada/parada).
  private static readonly CAMPOS_EDITABLES_TRAS_CIERRE: readonly string[] = ['observacion'];

  override async update(id: number, data: Partial<Pasada>): Promise<Pasada | null> {
    const pasada = await this.findById(id);
    if (!pasada) return null;

    const cerrada =
      pasada.estado === PasadaEstado.COMPLETA ||
      pasada.estado === PasadaEstado.ABORTADA ||
      pasada.estado === PasadaEstado.PARADA;

    if (cerrada) {
      const keys = Object.keys(data);
      const soloCamposPermitidos =
        keys.length > 0 && keys.every((k) => PasadaService.CAMPOS_EDITABLES_TRAS_CIERRE.includes(k));
      if (!soloCamposPermitidos) {
        throw new Error('No se puede actualizar una pasada completada o abortada');
      }
    }

    return super.update(id, data);
  }

  override async softDelete(id: number): Promise<boolean> {
    const pasada = await this.findById(id);
    if (!pasada) return false;

    if (
      pasada.estado === PasadaEstado.COMPLETA ||
      pasada.estado === PasadaEstado.ABORTADA ||
      pasada.estado === PasadaEstado.PARADA
    ) {
      throw new Error('No se puede eliminar una pasada completada o abortada');
    }

    return super.softDelete(id);
  }
}
