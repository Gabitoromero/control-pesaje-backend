import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FlushEventArgs } from '@mikro-orm/core';
import { AuditSubscriber } from './audit.subscriber.js';
import { runWithAuditUser } from './audit-context.js';

const execute = vi.fn();
const ctx = { tx: true };

const makeArgs = (changeSets: unknown[]): FlushEventArgs => {
  const uow = { getChangeSets: () => changeSets };
  const em = { getConnection: () => ({ execute }), getTransactionContext: () => ctx };
  return { uow, em } as unknown as FlushEventArgs;
};

const cs = (className: string, type: string, entity: object, payload = {}, originalEntity?: object) => ({
  meta: { className },
  type,
  entity,
  payload,
  originalEntity,
});

beforeEach(() => {
  execute.mockReset();
  execute.mockResolvedValue([]);
});

describe('AuditSubscriber', () => {
  it('writes one row per audited change, attributed to the user in context, inside the caller transaction', async () => {
    const sub = new AuditSubscriber();
    const args = makeArgs([cs('Articulo', 'update', { id: 5 }, { nombre: 'B' }, { nombre: 'A' })]);

    await runWithAuditUser(42, async () => {
      sub.onFlush(args);
      await sub.afterFlush(args);
    });

    expect(execute).toHaveBeenCalledTimes(1);
    const [sql, params, method, usedCtx] = execute.mock.calls[0];
    expect(sql).toContain('insert into "historial_cambio"');
    expect(params).toEqual(['articulo', 5, 'articulo', 5, 'editar', 42, JSON.stringify({ nombre: 'A' }), JSON.stringify({ nombre: 'B' })]);
    expect(method).toBe('run');
    expect(usedCtx).toBe(ctx);
  });

  it('reads the generated id after the insert for created rows', async () => {
    const sub = new AuditSubscriber();
    const entity: { id?: number } = {};
    const args = makeArgs([cs('Etapa', 'create', entity, { nombre: 'N' })]);

    await runWithAuditUser(1, async () => {
      sub.onFlush(args);
      entity.id = 99; // assigned by the INSERT
      await sub.afterFlush(args);
    });

    expect(execute.mock.calls[0][1].slice(0, 5)).toEqual(['etapa', 99, 'etapa', 99, 'crear']);
  });

  it('never audits its own table or non-audited entities', async () => {
    const sub = new AuditSubscriber();
    const args = makeArgs([cs('HistorialCambio', 'create', { id: 1 }), cs('Pasada', 'update', { id: 1 }, { x: 1 }, { x: 2 })]);
    await runWithAuditUser(1, async () => {
      sub.onFlush(args);
      await sub.afterFlush(args);
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('nested ruta changes (etapa tolerancia, removed articulo) are rooted at the ruta', async () => {
    const sub = new AuditSubscriber();
    const args = makeArgs([
      cs('RutaPasadaEtapa', 'update', { id: 7 }, { toleranciaPct: 8 }, { rutaPasada: 3, toleranciaPct: '5.00' }),
      cs('ArticuloRutaPasada', 'delete', { id: 2 }, {}, { articulo: 10, rutaPasada: 3 }),
    ]);
    await runWithAuditUser(1, async () => {
      sub.onFlush(args);
      await sub.afterFlush(args);
    });
    const roots = execute.mock.calls.map((c) => c[1].slice(2, 5));
    expect(roots).toEqual([
      ['ruta', 3, 'editar'],
      ['ruta', 3, 'eliminar'],
    ]);
  });

  it('without a session, attributes to the esSistema user', async () => {
    const sub = new AuditSubscriber();
    execute.mockImplementation(async (sql: string) => (sql.startsWith('select') ? [{ id: 77 }] : []));
    const args = makeArgs([cs('Linea' + 'Produccion', 'update', { id: 1 }, { observacion: 'x' }, { observacion: null })]);
    sub.onFlush(args);
    await sub.afterFlush(args);
    const insert = execute.mock.calls.find((c) => String(c[0]).startsWith('insert'))!;
    expect(insert[1][5]).toBe(77);
  });

  it('stores null attribution when there is neither a session nor a system user', async () => {
    const sub = new AuditSubscriber();
    const args = makeArgs([cs('Articulo', 'create', { id: 1 }, { codigo: 'X' })]);
    sub.onFlush(args);
    await sub.afterFlush(args);
    const insert = execute.mock.calls.find((c) => String(c[0]).startsWith('insert'))!;
    expect(insert[1][5]).toBeNull();
  });
});
