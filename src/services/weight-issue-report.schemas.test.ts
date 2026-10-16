import { describe, it, expect } from 'vitest';
import { reportPayloadSchema, rbDiagnosticSchema, rbVersionProbeSchema } from './weight-issue-report.schemas.js';

const validPayload = {
  v: 1,
  lineaId: 3,
  ultimoPeso: 45.2,
  ultimoPesoHaceMs: 12000,
  unidad: 'kg',
  socketConectado: true,
  balanzaConectada: true,
  enSala: true,
  pantalla: 'tablet',
  clientTs: 1_760_000_000_000,
};

const validDiag = {
  v: 1,
  version: 'abc1234',
  serial: { abierto: true, path: '/dev/ttyUSB0', baud: 9600, ultimoByteHaceMs: 120 },
  contadores: { bytes: 1000, validas: 40, descartadas: 2, ultimaDescartada: 'xx' },
  tramasCrudas: [{ t: 1_760_000_000_000, raw: '1.250 kg' }],
  logs: ['2026-10-16T09:00:00Z LOG hola'],
};

describe('reportPayloadSchema', () => {
  it('accepts a valid v1 payload', () => {
    expect(reportPayloadSchema.safeParse(validPayload).success).toBe(true);
  });

  it('accepts null weight, age, unit and lineaId (never received a frame)', () => {
    const r = reportPayloadSchema.safeParse({
      ...validPayload,
      lineaId: null,
      ultimoPeso: null,
      ultimoPesoHaceMs: null,
      unidad: null,
    });
    expect(r.success).toBe(true);
  });

  it('accepts both screens and rejects an unknown one', () => {
    expect(reportPayloadSchema.safeParse({ ...validPayload, pantalla: 'muestras-libres' }).success).toBe(true);
    expect(reportPayloadSchema.safeParse({ ...validPayload, pantalla: 'otra' }).success).toBe(false);
  });

  it.each([
    ['missing v', { ...validPayload, v: undefined }],
    ['wrong v', { ...validPayload, v: 2 }],
    ['non-numeric weight', { ...validPayload, ultimoPeso: 'abc' }],
    ['non-boolean flag', { ...validPayload, enSala: 'yes' }],
    ['non-finite clientTs', { ...validPayload, clientTs: Number.NaN }],
    ['negative age', { ...validPayload, ultimoPesoHaceMs: -1 }],
    ['non-object', 'hola'],
    ['null', null],
  ])('rejects %s', (_name, input) => {
    expect(reportPayloadSchema.safeParse(input).success).toBe(false);
  });
});

describe('rbVersionProbeSchema', () => {
  it('extracts v from any object, whatever its value', () => {
    const r = rbVersionProbeSchema.safeParse({ v: 2, extra: true });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.v).toBe(2);
  });

  it('rejects non-objects', () => {
    expect(rbVersionProbeSchema.safeParse('x').success).toBe(false);
    expect(rbVersionProbeSchema.safeParse(null).success).toBe(false);
  });
});

describe('rbDiagnosticSchema', () => {
  it('accepts a valid v1 response', () => {
    expect(rbDiagnosticSchema.safeParse(validDiag).success).toBe(true);
  });

  it('accepts null ultimoByteHaceMs and null ultimaDescartada', () => {
    const r = rbDiagnosticSchema.safeParse({
      ...validDiag,
      serial: { ...validDiag.serial, abierto: false, ultimoByteHaceMs: null },
      contadores: { ...validDiag.contadores, ultimaDescartada: null },
    });
    expect(r.success).toBe(true);
  });

  it('rejects v other than 1', () => {
    expect(rbDiagnosticSchema.safeParse({ ...validDiag, v: 2 }).success).toBe(false);
  });

  it('accepts up to 200 raw frames and 100 logs, rejects more', () => {
    const frames = (n: number) => Array.from({ length: n }, (_, i) => ({ t: i, raw: 'x' }));
    const logs = (n: number) => Array.from({ length: n }, () => 'l');
    expect(rbDiagnosticSchema.safeParse({ ...validDiag, tramasCrudas: frames(200), logs: logs(100) }).success).toBe(true);
    expect(rbDiagnosticSchema.safeParse({ ...validDiag, tramasCrudas: frames(201) }).success).toBe(false);
    expect(rbDiagnosticSchema.safeParse({ ...validDiag, logs: logs(101) }).success).toBe(false);
  });

  it('rejects missing sections and wrong types', () => {
    const { serial: _serial, ...withoutSerial } = validDiag;
    expect(rbDiagnosticSchema.safeParse(withoutSerial).success).toBe(false);
    expect(rbDiagnosticSchema.safeParse({ ...validDiag, contadores: { ...validDiag.contadores, bytes: -1 } }).success).toBe(false);
    expect(rbDiagnosticSchema.safeParse({ ...validDiag, version: 123 }).success).toBe(false);
  });
});
