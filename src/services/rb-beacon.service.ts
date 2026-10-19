export interface RbBeaconData {
  uptimeS?: number;
  throttled?: string;
  tempC?: number;
}

export interface RbBeaconEntry extends RbBeaconData {
  lastSeenAt: number;
}

export interface RbBeaconSnapshot extends RbBeaconEntry {
  ageMs: number;
}

export interface RbBeaconOptions {
  now?: () => number;
  /** Fixed TTL. When omitted, RB_BEACON_TTL_SECONDS is read lazily on each check. */
  ttlMs?: number;
}

const DEFAULT_TTL_MS = 60_000;

/**
 * In-memory store of the last HTTP beacon received from each RB (Raspberry).
 * Lets the backend tell "powered but not in the socket" from "off".
 */
export class RbBeaconService {
  private beacons = new Map<string, RbBeaconEntry>();
  private readonly now: () => number;
  private readonly fixedTtlMs?: number;

  constructor(options: RbBeaconOptions = {}) {
    this.now = options.now ?? Date.now;
    this.fixedTtlMs = options.ttlMs;
  }

  private get ttlMs(): number {
    if (this.fixedTtlMs !== undefined) {
      return this.fixedTtlMs;
    }
    const seconds = Number(process.env.RB_BEACON_TTL_SECONDS);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_TTL_MS;
  }

  record(hardwareId: string, data: RbBeaconData): void {
    this.beacons.set(hardwareId, { ...data, lastSeenAt: this.now() });
  }

  /** Returns the last beacon (even if stale) plus its age, or undefined when none was ever received. */
  get(hardwareId: string): RbBeaconSnapshot | undefined {
    const entry = this.beacons.get(hardwareId);
    if (!entry) {
      return undefined;
    }
    return { ...entry, ageMs: this.now() - entry.lastSeenAt };
  }

  isFresh(hardwareId: string): boolean {
    const snapshot = this.get(hardwareId);
    return snapshot !== undefined && snapshot.ageMs <= this.ttlMs;
  }

  remove(hardwareId: string): void {
    this.beacons.delete(hardwareId);
  }
}

export const rbBeaconService = new RbBeaconService();
