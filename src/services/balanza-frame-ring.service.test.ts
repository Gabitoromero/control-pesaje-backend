import { describe, it, expect } from 'vitest';
import { BalanzaFrameRing } from './balanza-frame-ring.service.js';

const accepted = (pesoNeto: number) => ({ pesoNeto, unidad: 'kg', aceptada: true });

describe('BalanzaFrameRing', () => {
  it('returns an empty snapshot for an unknown línea', () => {
    expect(new BalanzaFrameRing().snapshot(1)).toEqual([]);
  });

  it('stamps entries with the injected clock and keeps oldest -> newest order', () => {
    let t = 1000;
    const ring = new BalanzaFrameRing({ now: () => t++ });
    ring.record(1, accepted(1));
    ring.record(1, { pesoNeto: null, unidad: null, aceptada: false, motivo: 'payload-invalido' });
    ring.record(1, accepted(3));

    expect(ring.snapshot(1)).toEqual([
      { t: 1000, pesoNeto: 1, unidad: 'kg', aceptada: true },
      { t: 1001, pesoNeto: null, unidad: null, aceptada: false, motivo: 'payload-invalido' },
      { t: 1002, pesoNeto: 3, unidad: 'kg', aceptada: true },
    ]);
  });

  it('defaults to a capacity of 100 and keeps only the last 100 of 150 frames in order', () => {
    const ring = new BalanzaFrameRing();
    for (let i = 1; i <= 150; i++) ring.record(1, accepted(i));

    const snap = ring.snapshot(1);
    expect(snap).toHaveLength(100);
    expect(snap[0].pesoNeto).toBe(51);
    expect(snap[99].pesoNeto).toBe(150);
    expect(snap.map((e) => e.pesoNeto)).toEqual(Array.from({ length: 100 }, (_, i) => 51 + i));
  });

  it('honours a custom capacity and exactly-full wrap boundary', () => {
    const ring = new BalanzaFrameRing({ capacity: 3 });
    for (let i = 1; i <= 3; i++) ring.record(1, accepted(i));
    expect(ring.snapshot(1).map((e) => e.pesoNeto)).toEqual([1, 2, 3]);
    ring.record(1, accepted(4));
    expect(ring.snapshot(1).map((e) => e.pesoNeto)).toEqual([2, 3, 4]);
  });

  it('returns a copy: mutating a snapshot does not affect the ring', () => {
    const ring = new BalanzaFrameRing();
    ring.record(1, accepted(1));
    const snap = ring.snapshot(1);
    snap.push({ t: 0, pesoNeto: 99, unidad: 'kg', aceptada: true });
    snap[0].pesoNeto = 42;

    expect(ring.snapshot(1)).toHaveLength(1);
    expect(ring.snapshot(1)[0].pesoNeto).toBe(1);
  });

  it('isolates líneas from each other', () => {
    const ring = new BalanzaFrameRing({ capacity: 2 });
    ring.record(1, accepted(1));
    ring.record(2, accepted(20));
    ring.record(1, accepted(2));
    ring.record(1, accepted(3));

    expect(ring.snapshot(1).map((e) => e.pesoNeto)).toEqual([2, 3]);
    expect(ring.snapshot(2).map((e) => e.pesoNeto)).toEqual([20]);
  });

  it('evicts the oldest-inserted línea when maxLineas is reached', () => {
    const ring = new BalanzaFrameRing({ maxLineas: 2 });
    ring.record(1, accepted(1));
    ring.record(2, accepted(2));
    ring.record(1, accepted(11)); // recording again does not refresh insertion order
    ring.record(3, accepted(3));

    expect(ring.snapshot(1)).toEqual([]);
    expect(ring.snapshot(2)).toHaveLength(1);
    expect(ring.snapshot(3)).toHaveLength(1);
  });

  it('defaults maxLineas to 64', () => {
    const ring = new BalanzaFrameRing();
    for (let id = 1; id <= 65; id++) ring.record(id, accepted(id));

    expect(ring.snapshot(1)).toEqual([]);
    expect(ring.snapshot(2)).toHaveLength(1);
    expect(ring.snapshot(65)).toHaveLength(1);
  });

  it('clear() drops the frames of one línea only', () => {
    const ring = new BalanzaFrameRing();
    ring.record(1, accepted(1));
    ring.record(2, accepted(2));
    ring.clear(1);

    expect(ring.snapshot(1)).toEqual([]);
    expect(ring.snapshot(2)).toHaveLength(1);
  });
});
