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

  /** Upserts the singleton row (id = 1) and records who changed it and when. */
  async update(
    em: EntityManager,
    input: { toleranciaPct: number; usuarioId: number },
  ): Promise<ToleranciaConfigDto> {
    const updatedAt = new Date();
    const updatedByUsuario = em.getReference(Usuario, input.usuarioId);
    const existing = await em.findOne(ConfigSistema, { id: CONFIG_SISTEMA_ID });

    let row: ConfigSistema;
    if (existing) {
      existing.toleranciaPct = input.toleranciaPct;
      existing.updatedAt = updatedAt;
      existing.updatedByUsuario = updatedByUsuario;
      row = existing;
    } else {
      row = em.create(ConfigSistema, {
        id: CONFIG_SISTEMA_ID,
        toleranciaPct: input.toleranciaPct,
        updatedAt,
        updatedByUsuario,
      });
    }

    await em.flush();
    // The reference is an uninitialized proxy; load it so the DTO has the user's name.
    await em.populate(row, ['updatedByUsuario']);
    return toDto(row);
  },
};
