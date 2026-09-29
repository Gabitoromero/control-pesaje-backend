import type { EntityManager } from '@mikro-orm/core';
import { ConfigSistema, CONFIG_SISTEMA_ID } from '../models/ConfigSistema.js';
import { Usuario } from '../models/Usuario.js';

export interface ToleranciaConfigDto {
  toleranciaPct: number;
  updatedAt: string; // ISO
  updatedBy: { id: number; nombreUsuario: string; nombreApellido: string } | null;
}

// Explicit whitelist: never expose pinHash or other usuario fields.
const toDto = (row: ConfigSistema): ToleranciaConfigDto => ({
  // Postgres decimals arrive as strings.
  toleranciaPct: Number(row.toleranciaPct),
  updatedAt: row.updatedAt.toISOString(),
  updatedBy: row.updatedByUsuario
    ? {
        id: row.updatedByUsuario.id,
        nombreUsuario: row.updatedByUsuario.nombreUsuario,
        nombreApellido: row.updatedByUsuario.nombreApellido,
      }
    : null,
});

export const toleranciaConfigService = {
  /** Returns null when the singleton row is missing (no fabricated default). */
  async get(em: EntityManager): Promise<ToleranciaConfigDto | null> {
    const row = await em.findOne(
      ConfigSistema,
      { id: CONFIG_SISTEMA_ID },
      { populate: ['updatedByUsuario'] },
    );
    return row ? toDto(row) : null;
  },

  /** Atomically upserts the singleton row (id = 1) and records who changed it and when. */
  async update(
    em: EntityManager,
    input: { toleranciaPct: number; usuarioId: number },
  ): Promise<ToleranciaConfigDto> {
    const updatedAt = new Date();
    const updatedByUsuario = em.getReference(Usuario, input.usuarioId);
    // Single INSERT ... ON CONFLICT (id) DO UPDATE: atomic, so concurrent PUTs
    // on a missing row cannot fail with a PK conflict (last write wins).
    const row = await em.upsert(ConfigSistema, {
      id: CONFIG_SISTEMA_ID,
      toleranciaPct: input.toleranciaPct,
      updatedAt,
      updatedByUsuario,
    });

    // The reference is an uninitialized proxy; load it so the DTO has the user's name.
    await em.populate(row, ['updatedByUsuario']);
    return toDto(row);
  },
};
