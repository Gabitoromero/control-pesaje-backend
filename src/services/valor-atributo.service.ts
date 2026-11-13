import { RequestContext, type EntityManager } from '@mikro-orm/core';
import { AtributoEtapaRuta } from '../models/AtributoEtapaRuta.js';
import { ValorAtributo } from '../models/ValorAtributo.js';
import { Muestra, MuestraEstadoValidacion } from '../models/Muestra.js';
import { Pasada, PasadaEstado } from '../models/Pasada.js';
import { RutaPasadaEtapa } from '../models/RutaPasadaEtapa.js';
import { Usuario } from '../models/Usuario.js';
import { Etapa } from '../models/Etapa.js';
import { sesionService } from './sesion.service.js';
import { VALOR_ATRIBUTO_ACEPTADO, VALOR_ATRIBUTO_NO_ACEPTADO } from '../shared/constants.js';

export interface ValorAtributoInput {
  atributoId: number;
  valor: number;
}

/**
 * Active atributos of a ruta-etapa that still have no value loaded in the pasada.
 * Shared with the sequential-stage rule of MuestraService (a stage cannot be left with cualidades pending).
 */
export async function atributosPendientes(em: EntityManager, pasadaId: number, rutaPasadaEtapaId: number): Promise<AtributoEtapaRuta[]> {
  const atributos = await em.find(AtributoEtapaRuta, { rutaPasadaEtapa: rutaPasadaEtapaId, activo: true }, { orderBy: { id: 'asc' } });
  if (atributos.length === 0) return [];
  const cargados = await em.find(ValorAtributo, { pasada: pasadaId, atributo: { $in: atributos.map((a) => a.id) } });
  const idsCargados = new Set(cargados.map((v) => v.atributo.id));
  return atributos.filter((a) => !idsCargados.has(a.id));
}

export class ValorAtributoService {
  private getEm() {
    const em = RequestContext.getEntityManager();
    if (!em) throw new Error('No EntityManager in RequestContext');
    return em;
  }

  /**
   * Loads the cualidades of a stage of a pasada. Allowed only once the stage has all its required samples
   * (and never for a stage that requires none). The range check is non-blocking: an out-of-range value is
   * stored as 'fuera_de_rango'. A loaded value can never be corrected, so each atributo is loaded once.
   */
  async registrarValores(usuarioId: number, pasadaId: number, etapaId: number, valores: ValorAtributoInput[]): Promise<ValorAtributo[]> {
    const em = this.getEm();

    return em.transactional(async (tx) => {
      const pasada = await tx.findOne(Pasada, pasadaId, { populate: ['rutaPasada', 'usuario', 'lineaProduccion'] });
      if (!pasada) throw new Error(`Pasada with ID ${pasadaId} not found`);
      if (pasada.usuario.id !== usuarioId) {
        throw new Error(`User ${usuarioId} cannot load cualidades on pasada ${pasadaId}: not the owner`);
      }
      if (pasada.estado !== PasadaEstado.EN_CURSO) {
        throw new Error('Cannot load cualidades: Pasada is already completed or aborted');
      }

      const rutaEtapa = await tx.findOne(RutaPasadaEtapa, { rutaPasada: pasada.rutaPasada.id, etapa: etapaId });
      if (!rutaEtapa) {
        throw new Error(`No route configuration found for route ${pasada.rutaPasada.id} and stage ${etapaId}`);
      }
      if (rutaEtapa.cantidadMuestrasRequeridas <= 0) {
        throw new Error(`Stage ${etapaId} requires no samples: its cualidades are not asked`);
      }
      const muestras = await tx.count(Muestra, {
        pasada: pasadaId,
        etapa: etapaId,
        estadoValidacion: { $in: [MuestraEstadoValidacion.OK, MuestraEstadoValidacion.FUERA_DE_RANGO] },
      });
      if (muestras < rutaEtapa.cantidadMuestrasRequeridas) {
        throw new Error(`Stage ${etapaId} is not complete (progress: ${muestras}/${rutaEtapa.cantidadMuestrasRequeridas}): cualidades are loaded when its samples are done`);
      }

      const ids = valores.map((v) => v.atributoId);
      if (new Set(ids).size !== ids.length) throw new Error('Duplicate atributo in the same request');

      const pendientes = await atributosPendientes(tx, pasadaId, rutaEtapa.id);
      const pendientesPorId = new Map(pendientes.map((a) => [a.id, a]));

      const creados: ValorAtributo[] = [];
      for (const { atributoId, valor } of valores) {
        const atributo = pendientesPorId.get(atributoId);
        if (!atributo) {
          throw new Error(`Atributo ${atributoId} is not pending on stage ${etapaId} of this pasada (unknown, inactive or already loaded: loaded values cannot be corrected)`);
        }
        if (atributo.tipo === 'aceptado' && valor !== VALOR_ATRIBUTO_ACEPTADO && valor !== VALOR_ATRIBUTO_NO_ACEPTADO) {
          throw new Error(`Atributo '${atributo.nombre}' is aceptado/no aceptado: the value must be ${VALOR_ATRIBUTO_NO_ACEPTADO} or ${VALOR_ATRIBUTO_ACEPTADO}`);
        }

        const minimo = Number(atributo.minimo);
        const maximo = Number(atributo.maximo);
        const registro = new ValorAtributo();
        registro.pasada = pasada;
        registro.etapa = tx.getReference(Etapa, etapaId);
        registro.atributo = atributo;
        registro.usuario = tx.getReference(Usuario, usuarioId);
        registro.valor = valor;
        registro.timestamp = new Date();
        // Snapshot: later edits of the route must not rewrite what was measured against
        registro.nombre = atributo.nombre;
        registro.tipo = atributo.tipo;
        registro.minimo = minimo;
        registro.maximo = maximo;
        registro.estadoValidacion = valor >= minimo && valor <= maximo ? 'ok' : 'fuera_de_rango';
        tx.persist(registro);
        creados.push(registro);
      }
      await tx.flush();

      sesionService.actualizarActividad(pasada.lineaProduccion.id);
      return creados;
    });
  }

  async findAll(where?: { pasadaId?: number; etapaId?: number }): Promise<ValorAtributo[]> {
    const filter: Record<string, unknown> = { activo: true };
    if (where?.pasadaId !== undefined) filter.pasada = where.pasadaId;
    if (where?.etapaId !== undefined) filter.etapa = where.etapaId;
    return this.getEm().find(ValorAtributo, filter, { orderBy: { id: 'asc' } });
  }
}
