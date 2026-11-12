import { AsyncLocalStorage } from 'node:async_hooks';

export interface AuditContext {
  usuarioId: number;
}

const storage = new AsyncLocalStorage<AuditContext>();

/** Runs `fn` with the authenticated user bound, so the audit subscriber can attribute changes. */
export const runWithAuditUser = <T>(usuarioId: number, fn: () => T): T => storage.run({ usuarioId }, fn);

export const getAuditUserId = (): number | undefined => storage.getStore()?.usuarioId;
