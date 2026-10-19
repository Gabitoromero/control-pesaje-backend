import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RbBeaconService } from './rb-beacon.service.js';

describe('RbBeaconService', () => {
  let clock: number;
  let service: RbBeaconService;

  beforeEach(() => {
    clock = 1_000_000;
    service = new RbBeaconService({ now: () => clock, ttlMs: 60_000 });
  });

  afterEach(() => {
    delete process.env.RB_BEACON_TTL_SECONDS;
  });

  it('returns undefined and not fresh for an unknown hardwareId', () => {
    expect(service.get('hw-x')).toBeUndefined();
    expect(service.isFresh('hw-x')).toBe(false);
  });

  it('records a beacon and exposes its facts with ageMs', () => {
    service.record('hw-1', { uptimeS: 120, throttled: '0x0', tempC: 51.2 });
    clock += 5_000;
    expect(service.get('hw-1')).toEqual({
      lastSeenAt: 1_000_000,
      uptimeS: 120,
      throttled: '0x0',
      tempC: 51.2,
      ageMs: 5_000,
    });
    expect(service.isFresh('hw-1')).toBe(true);
  });

  it('is fresh up to the ttl and stale after it', () => {
    service.record('hw-1', {});
    clock += 60_000;
    expect(service.isFresh('hw-1')).toBe(true);
    clock += 1;
    expect(service.isFresh('hw-1')).toBe(false);
    // stale entries stay readable for diagnostics
    expect(service.get('hw-1')?.ageMs).toBe(60_001);
  });

  it('overwrites a previous beacon for the same hardwareId', () => {
    service.record('hw-1', { uptimeS: 10, tempC: 40 });
    clock += 30_000;
    service.record('hw-1', { uptimeS: 40 });
    expect(service.get('hw-1')).toEqual({ lastSeenAt: 1_030_000, uptimeS: 40, ageMs: 0 });
  });

  it('removes an entry', () => {
    service.record('hw-1', {});
    service.remove('hw-1');
    expect(service.get('hw-1')).toBeUndefined();
  });

  it('reads RB_BEACON_TTL_SECONDS lazily when no ttlMs is injected', () => {
    const lazy = new RbBeaconService({ now: () => clock });
    lazy.record('hw-1', {});
    clock += 30_000;
    expect(lazy.isFresh('hw-1')).toBe(true); // default 60s
    process.env.RB_BEACON_TTL_SECONDS = '10';
    expect(lazy.isFresh('hw-1')).toBe(false);
  });

  it('ignores an invalid RB_BEACON_TTL_SECONDS and falls back to the default', () => {
    const lazy = new RbBeaconService({ now: () => clock });
    lazy.record('hw-1', {});
    process.env.RB_BEACON_TTL_SECONDS = 'abc';
    clock += 30_000;
    expect(lazy.isFresh('hw-1')).toBe(true);
  });
});
