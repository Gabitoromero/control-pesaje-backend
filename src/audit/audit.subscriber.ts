import type { EntityManager, EventSubscriber, FlushEventArgs, TransactionEventArgs, UnitOfWork } from '@mikro-orm/core';
import { getAuditUserId } from './audit-context.js';
import { AUDITED_ENTITIES, buildAuditRecord, type RawChange } from './audit-diff.js';

interface PendingChange extends Omit<RawChange, 'entityId' | 'current'> {
  entity: Record<string, unknown> & { id?: number };
  entityId: number | undefined;
}

const HISTORIAL_TABLE = 'historial_cambio';

/**
 * Records every create/update/delete of the audited entities into `historial_cambio`.
 *
 * onFlush snapshots the change sets (ids of new rows do not exist yet); afterFlush
 * writes the rows. Inside `em.transactional()` the insert joins the caller's
 * transaction. Rows are written with raw SQL so the audit table itself never goes
 * through the unit of work (no recursion, insert-only by construction).
 */
export class AuditSubscriber implements EventSubscriber {
  private readonly pending = new WeakMap<UnitOfWork, PendingChange[]>();
  private systemUserId: number | undefined;

  onFlush(args: FlushEventArgs): void {
    const changes: PendingChange[] = [];
    for (const cs of args.uow.getChangeSets()) {
      const name = cs.meta.className;
      if (!AUDITED_ENTITIES[name]) continue;
      const type = cs.type === 'create' ? 'create' : cs.type === 'update' || cs.type === 'update_early' ? 'update' : cs.type === 'delete' || cs.type === 'delete_early' ? 'delete' : undefined;
      if (!type) continue;
      const entity = cs.entity as PendingChange['entity'];
      changes.push({
        type,
        name,
        entity,
        entityId: typeof entity.id === 'number' ? entity.id : undefined,
        original: cs.originalEntity ? { ...(cs.originalEntity as Record<string, unknown>) } : undefined,
        payload: { ...(cs.payload as Record<string, unknown>) },
      });
    }
    if (changes.length > 0) this.pending.set(args.uow, changes);
  }

  /**
   * Implicit flushes open their own transaction: write the rows right before it
   * commits so the change and its audit rows are atomic.
   */
  async beforeTransactionCommit(args: TransactionEventArgs): Promise<void> {
    if (!args.uow || !args.transaction) return;
    await this.write(args.em, args.uow, args.transaction);
  }

  /** Flushes inside an outer `em.transactional()` join the caller's transaction here. */
  async afterFlush(args: FlushEventArgs): Promise<void> {
    await this.write(args.em, args.uow, args.em.getTransactionContext());
  }

  private async write(em: EntityManager, uow: UnitOfWork, ctx: unknown): Promise<void> {
    const changes = this.pending.get(uow);
    if (!changes) return;
    this.pending.delete(uow);

    const records = changes
      .map((c) =>
        buildAuditRecord({
          type: c.type,
          name: c.name,
          entityId: c.entityId ?? (typeof c.entity.id === 'number' ? c.entity.id : undefined),
          original: c.original,
          payload: c.payload,
          current: c.type === 'delete' ? c.entity : undefined,
        }),
      )
      .filter((r) => r !== undefined);
    if (records.length === 0) return;

    const connection = em.getConnection();
    const usuarioId = getAuditUserId() ?? (await this.resolveSystemUserId(em, ctx));

    for (const r of records) {
      await connection.execute(
        `insert into "${HISTORIAL_TABLE}" ("entidad", "entidad_id", "raiz_tipo", "raiz_id", "accion", "usuario_id", "antes", "despues") values (?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb)`,
        [r.entidad, r.entidadId, r.raizTipo, r.raizId, r.accion, usuarioId ?? null, JSON.stringify(r.antes), JSON.stringify(r.despues)],
        'run',
        ctx as never,
      );
    }
  }

  /** Changes without a session (scripts, socket handlers) are attributed to the `esSistema` user, when one exists. */
  private async resolveSystemUserId(em: EntityManager, ctx: unknown): Promise<number | undefined> {
    if (this.systemUserId !== undefined) return this.systemUserId;
    const rows = (await em
      .getConnection()
      .execute(`select "id" from "usuario" where "es_sistema" = true order by "id" limit 1`, [], 'all', ctx as never)) as { id: number }[];
    this.systemUserId = rows[0]?.id;
    return this.systemUserId;
  }
}
