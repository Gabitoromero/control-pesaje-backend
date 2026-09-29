import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityManager } from '@mikro-orm/core';
import { toleranciaConfigService } from './tolerancia-config.service.js';
import { ConfigSistema, CONFIG_SISTEMA_ID } from '../models/ConfigSistema.js';
import { Usuario } from '../models/Usuario.js';

const mockEm = {
  findOne: vi.fn(),
  upsert: vi.fn(),
  getReference: vi.fn(),
  flush: vi.fn(),
  populate: vi.fn(),
};
const em = mockEm as unknown as EntityManager;

const ana = {
  id: 7,
  nombreUsuario: 'ana',
  nombreApellido: 'Ana Perez',
  pinHash: 'secret-hash',
  legajo: '12345',
};

beforeEach(() => {
  vi.resetAllMocks();
  mockEm.flush.mockResolvedValue(undefined);
  mockEm.populate.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('toleranciaConfigService.get', () => {
  it('returns the DTO with a Number-coerced pct and the updatedBy object', async () => {
    const updatedAt = new Date('2026-09-01T10:00:00Z');
    mockEm.findOne.mockResolvedValue({
      id: 1,
      toleranciaPct: '12.50', // Postgres decimals arrive as strings
      updatedAt,
      updatedByUsuario: ana,
    });

    const dto = await toleranciaConfigService.get(em);

    expect(mockEm.findOne).toHaveBeenCalledWith(
      ConfigSistema,
      { id: CONFIG_SISTEMA_ID },
      { populate: ['updatedByUsuario'] },
    );
    expect(dto).toEqual({
      toleranciaPct: 12.5,
      updatedAt: '2026-09-01T10:00:00.000Z',
      updatedBy: { id: 7, nombreUsuario: 'ana', nombreApellido: 'Ana Perez' },
    });
  });

  it('never exposes pinHash or other usuario fields', async () => {
    mockEm.findOne.mockResolvedValue({
      id: 1,
      toleranciaPct: 20,
      updatedAt: new Date(),
      updatedByUsuario: ana,
    });

    const dto = await toleranciaConfigService.get(em);

    expect(Object.keys(dto!.updatedBy!).sort()).toEqual(['id', 'nombreApellido', 'nombreUsuario']);
    expect(JSON.stringify(dto)).not.toContain('secret-hash');
  });

  it('returns updatedBy null for a never-updated row', async () => {
    mockEm.findOne.mockResolvedValue({
      id: 1,
      toleranciaPct: 20,
      updatedAt: new Date('2026-09-01T10:00:00Z'),
      updatedByUsuario: null,
    });

    const dto = await toleranciaConfigService.get(em);

    expect(dto).toEqual({
      toleranciaPct: 20,
      updatedAt: '2026-09-01T10:00:00.000Z',
      updatedBy: null,
    });
  });

  it('returns null when the row is missing (no fabricated default)', async () => {
    mockEm.findOne.mockResolvedValue(null);

    const dto = await toleranciaConfigService.get(em);

    expect(dto).toBeNull();
  });
});

describe('toleranciaConfigService.update', () => {
  it('atomically upserts id=1 with pct, updatedAt and updatedByUsuario and returns the DTO', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-29T12:00:00Z'));
    const row = {
      id: 1,
      toleranciaPct: 25,
      updatedAt: new Date('2026-09-29T12:00:00Z'),
      updatedByUsuario: ana as unknown,
    };
    mockEm.getReference.mockReturnValue(ana);
    mockEm.upsert.mockResolvedValue(row);

    const dto = await toleranciaConfigService.update(em, { toleranciaPct: 25, usuarioId: 7 });

    expect(mockEm.getReference).toHaveBeenCalledWith(Usuario, 7);
    expect(mockEm.upsert).toHaveBeenCalledTimes(1);
    expect(mockEm.upsert).toHaveBeenCalledWith(ConfigSistema, {
      id: CONFIG_SISTEMA_ID,
      toleranciaPct: 25,
      updatedAt: new Date('2026-09-29T12:00:00Z'),
      updatedByUsuario: ana,
    });
    // getReference returns an uninitialized proxy: it must be loaded to build the DTO.
    expect(mockEm.populate).toHaveBeenCalledWith(row, ['updatedByUsuario']);
    expect(dto).toEqual({
      toleranciaPct: 25,
      updatedAt: '2026-09-29T12:00:00.000Z',
      updatedBy: { id: 7, nombreUsuario: 'ana', nombreApellido: 'Ana Perez' },
    });
  });

  it('does not do a find-then-create (race-free)', async () => {
    mockEm.getReference.mockReturnValue(ana);
    mockEm.upsert.mockResolvedValue({
      id: 1,
      toleranciaPct: 30,
      updatedAt: new Date(),
      updatedByUsuario: ana,
    });

    await toleranciaConfigService.update(em, { toleranciaPct: 30, usuarioId: 7 });

    expect(mockEm.findOne).not.toHaveBeenCalled();
  });

  it('reflects the last writer (last write wins)', async () => {
    const beto = { id: 9, nombreUsuario: 'beto', nombreApellido: 'Beto Gomez' };
    mockEm.getReference.mockReturnValue(beto);
    mockEm.upsert.mockResolvedValue({
      id: 1,
      toleranciaPct: 0,
      updatedAt: new Date('2026-09-29T12:00:00Z'),
      updatedByUsuario: beto,
    });

    const dto = await toleranciaConfigService.update(em, { toleranciaPct: 0, usuarioId: 9 });

    expect(dto.toleranciaPct).toBe(0);
    expect(dto.updatedBy).toEqual({ id: 9, nombreUsuario: 'beto', nombreApellido: 'Beto Gomez' });
  });
});
