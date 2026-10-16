import { describe, it, expect } from 'vitest';
import {
  formatSummary,
  formatAttachment,
  attachmentFilename,
  SUMMARY_MAX_LENGTH,
  ATTACHMENT_MAX_LENGTH,
  type WeightIssueReport,
  type RbResult,
} from './weight-issue-report.formatter.js';
import type { FrameEntry } from './balanza-frame-ring.service.js';
import type { RbDiagnostic } from './weight-issue-report.schemas.js';

const ACCEPTED_AT = Date.UTC(2026, 9, 16, 12, 0, 0); // 2026-10-16T12:00:00Z

const makeFrames = (n: number): FrameEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    t: ACCEPTED_AT - (n - i) * 1000,
    pesoNeto: 1000 + i,
    unidad: 'g',
    aceptada: i % 2 === 0,
    ...(i % 2 === 0 ? {} : { motivo: 'sin-sesion' as const }),
  }));

const makeDiag = (overrides: Partial<RbDiagnostic> = {}): RbDiagnostic => ({
  v: 1,
  version: 'abc1234',
  serial: { abierto: true, path: '/dev/ttyUSB0', baud: 9600, ultimoByteHaceMs: 2500 },
  contadores: { bytes: 5000, validas: 40, descartadas: 3, ultimaDescartada: 'basura' },
  tramasCrudas: Array.from({ length: 100 }, (_, i) => ({ t: ACCEPTED_AT - (100 - i) * 500, raw: `RAW-${i}` })),
  logs: Array.from({ length: 50 }, (_, i) => `2026-10-16T11:59:00Z LOG linea-de-log-${i}`),
  ...overrides,
});

const makeReport = (overrides: Partial<WeightIssueReport> = {}): WeightIssueReport => ({
  reportId: 'ab12cd34',
  acceptedAt: ACCEPTED_AT,
  lineaId: 3,
  clientLineaId: 3,
  lineaMismatch: false,
  pantalla: 'tablet',
  tablet: {
    payload: {
      v: 1,
      lineaId: 3,
      ultimoPeso: 45.2,
      ultimoPesoHaceMs: 12000,
      unidad: 'kg',
      socketConectado: true,
      balanzaConectada: true,
      enSala: true,
      pantalla: 'tablet',
      clientTs: ACCEPTED_AT - 50,
    },
    serverEnSala: true,
    socketId: 'sock-1',
  },
  sesion: { estado: 'operario', usuarioId: 42, legajo: '123', nombreApellido: 'Ana Pérez', nombreUsuario: 'aperez', idleMs: 4000, vencida: false },
  backend: {
    lineaNombre: 'Línea 3',
    rbNombre: 'RB-3',
    rbHardwareId: 'hw-abc',
    rbConnected: true,
    rbSocketActivo: true,
    rbEnSala: true,
    tabletSockets: 2,
  },
  device: { hardwareId: 'hw-abc', unidad: 'g' },
  frames: makeFrames(100),
  rb: { estado: 'ok', diag: makeDiag() },
  ...overrides,
});

const withRb = (rb: RbResult): WeightIssueReport => makeReport({ rb });

describe('formatSummary', () => {
  it('stays within the summary limit with 100 frames, 100 RB raw frames, 50 logs and very long names', () => {
    const long = 'N'.repeat(5000);
    const report = makeReport({
      backend: { lineaNombre: long, rbNombre: long, rbHardwareId: long, rbConnected: true, tabletSockets: 99 },
      sesion: { estado: 'operario', usuarioId: 42, legajo: long, nombreApellido: long },
      rb: { estado: 'ok', diag: makeDiag({ version: 'v'.repeat(64), serial: { abierto: true, path: 'p'.repeat(200), baud: 9600, ultimoByteHaceMs: 1 } }) },
    });
    const summary = formatSummary(report);
    expect(summary.length).toBeLessThanOrEqual(SUMMARY_MAX_LENGTH);
    expect(SUMMARY_MAX_LENGTH).toBe(1900);
  });

  it('contains the headline with línea name, id and screen', () => {
    const summary = formatSummary(makeReport({ pantalla: 'muestras-libres' }));
    expect(summary).toContain('Reporte "No veo el peso"');
    expect(summary).toContain('Línea 3');
    expect(summary).toContain('id 3');
    expect(summary).toContain('muestras-libres');
  });

  it('lists only the last 5 backend frames and the last 3 RB raw frames', () => {
    const summary = formatSummary(makeReport());
    const backendLine = summary.split('\n').find((l) => l.startsWith('Últimas 5 backend'))!;
    // 5 entries separated by "; "
    expect(backendLine.split(';')).toHaveLength(5);
    // newest first: frame #99 has pesoNeto 1099
    expect(backendLine).toContain('1099g');
    expect(backendLine).not.toContain('1094g'); // 6th newest
    const rbLine = summary.split('\n').find((l) => l.startsWith('Últimas 3 RB crudas'))!;
    expect(rbLine.split(';')).toHaveLength(3);
    expect(rbLine).toContain('RAW-99');
    expect(rbLine).toContain('RAW-97');
    expect(rbLine).not.toContain('RAW-96');
  });

  it('summarises accepted and discarded counts with discard reasons', () => {
    const summary = formatSummary(makeReport());
    expect(summary).toContain('Tramas backend (100 en memoria): 50 aceptadas, 50 descartadas (sin-sesion: 50)');
  });

  it('says "ninguna" when the ring is empty', () => {
    const summary = formatSummary(makeReport({ frames: [] }));
    expect(summary).toContain('Tramas backend (0 en memoria)');
    expect(summary).toContain('ninguna');
    expect(summary).not.toContain('Últimas 5 backend');
  });

  describe('RB state lines', () => {
    it('ok: shows version, serial and counters', () => {
      const summary = formatSummary(makeReport());
      expect(summary).toContain('RB: versión abc1234');
      expect(summary).toContain('serial abierto /dev/ttyUSB0@9600');
      expect(summary).toContain('último byte hace 3 s');
      expect(summary).toContain('bytes 5000 válidas 40 descartadas 3');
    });

    it('ok with closed serial and no bytes', () => {
      const diag = makeDiag({ serial: { abierto: false, path: '/dev/ttyUSB0', baud: 9600, ultimoByteHaceMs: null } });
      const summary = formatSummary(withRb({ estado: 'ok', diag }));
      expect(summary).toContain('serial cerrado');
      expect(summary).toContain('sin bytes');
    });

    describe('serial closed with the last error', () => {
      const ENOENT = 'ENOENT: no such file or directory, cannot open /dev/ttyUSB0';
      const closedDiag = (serial: Record<string, unknown>) =>
        makeDiag({ serial: { abierto: false, path: '/dev/ttyUSB0', baud: 9600, ultimoByteHaceMs: null, ...serial } });

      it('says CERRADO with the error, its age and the failed attempts', () => {
        const diag = closedDiag({ ultimoError: ENOENT, ultimoErrorHaceMs: 3000, intentosFallidos: 12 });
        const summary = formatSummary(withRb({ estado: 'ok', diag }));
        expect(summary).toContain(`serial CERRADO: ${ENOENT} (hace 3 s, 12 intentos)`);
        expect(summary).not.toContain('serial abierto');
      });

      it('old RB without the new fields keeps the plain closed text', () => {
        const summary = formatSummary(withRb({ estado: 'ok', diag: closedDiag({}) }));
        expect(summary).toContain('serial cerrado /dev/ttyUSB0@9600');
        expect(summary).not.toContain('CERRADO');
      });

      it('open serial is unchanged even if stale error fields are present', () => {
        const diag = makeDiag({
          serial: { abierto: true, path: '/dev/ttyUSB0', baud: 9600, ultimoByteHaceMs: 2500, ultimoError: null, ultimoErrorHaceMs: null, intentosFallidos: 0 },
        });
        const summary = formatSummary(withRb({ estado: 'ok', diag }));
        expect(summary).toContain('serial abierto /dev/ttyUSB0@9600');
        expect(summary).not.toContain('CERRADO');
      });

      it('shortens a very long error and keeps the summary within the cap and its footer', () => {
        const diag = closedDiag({ ultimoError: 'E'.repeat(300), ultimoErrorHaceMs: 1000, intentosFallidos: 5 });
        const summary = formatSummary(withRb({ estado: 'ok', diag }));
        expect(summary).not.toContain('E'.repeat(150));
        expect(summary.length).toBeLessThanOrEqual(SUMMARY_MAX_LENGTH);
        expect(summary).toContain('detalle completo en adjunto');
      });

      it('the attachment RB section lists the three fields', () => {
        const diag = closedDiag({ ultimoError: ENOENT, ultimoErrorHaceMs: 3000, intentosFallidos: 12 });
        const text = formatAttachment(withRb({ estado: 'ok', diag }));
        expect(text).toContain(`ultimoError=${ENOENT}`);
        expect(text).toContain('ultimoErrorHaceMs=3000');
        expect(text).toContain('intentosFallidos=12');
      });
    });

    it('no-conectada', () => {
      const summary = formatSummary(withRb({ estado: 'no-conectada' }));
      expect(summary).toContain('RB no conectada (no se solicitó diagnóstico)');
      expect(summary).not.toContain('Últimas 3 RB crudas');
    });

    it('sin-respuesta uses the exact timeout text', () => {
      const summary = formatSummary(withRb({ estado: 'sin-respuesta' }));
      expect(summary).toContain('RB no respondió en 3 s (versión sin soporte o sin conexión)');
    });

    it('version-desconocida shows the unknown v', () => {
      const summary = formatSummary(withRb({ estado: 'version-desconocida', v: 2, raw: '{"v":2}' }));
      expect(summary).toContain('Respuesta RB inválida (v=2)');
    });

    it('invalida shows invalid response; truncated raw only goes to the attachment', () => {
      const raw = '{"basura":true}';
      const report = withRb({ estado: 'invalida', raw });
      expect(formatSummary(report)).toContain('Respuesta RB inválida');
      expect(formatSummary(report)).not.toContain(raw);
      expect(formatAttachment(report)).toContain(raw);
    });

    it('socket-no-encontrado', () => {
      const summary = formatSummary(withRb({ estado: 'socket-no-encontrado' }));
      expect(summary).toContain('Socket RB no encontrado');
    });
  });

  describe('session lines', () => {
    it('operario with legajo and name', () => {
      expect(formatSummary(makeReport())).toContain('Operario: 123 Ana Pérez');
    });

    it('sin sesión activa explains the discard', () => {
      const summary = formatSummary(makeReport({ sesion: { estado: 'sin-sesion' } }));
      expect(summary).toContain('Sin sesión activa: las tramas se descartan (sin-sesion)');
    });

    it('puesta a punto has no operator', () => {
      const summary = formatSummary(makeReport({ sesion: { estado: 'puesta-a-punto', usuarioId: null } }));
      expect(summary).toContain('Sesión en puesta a punto (sin operario)');
    });

    it('lookup failure falls back to the usuarioId marked as unresolved', () => {
      const summary = formatSummary(
        makeReport({ sesion: { estado: 'operario', usuarioId: 42, lookupError: 'no encontrado' } }),
      );
      expect(summary).toContain('usuarioId 42 (legajo/nombre no disponibles: no encontrado)');
    });

    it('flags an expired session pending close', () => {
      const summary = formatSummary(makeReport({ sesion: { estado: 'operario', usuarioId: 42, legajo: '1', nombreApellido: 'A', vencida: true, idleMs: 400000 } }));
      expect(summary).toContain('sesión vencida por inactividad, pendiente de cierre');
    });
  });

  describe('tablet line', () => {
    it('shows last weight and its age', () => {
      const summary = formatSummary(makeReport());
      expect(summary).toContain('último peso 45.2 kg hace 12 s');
    });

    it('says "sin pesos recibidos" when null', () => {
      const report = makeReport();
      report.tablet.payload = { ...report.tablet.payload, ultimoPeso: null, ultimoPesoHaceMs: null };
      expect(formatSummary(report)).toContain('sin pesos recibidos');
    });

    it('shows client room flag next to the server one', () => {
      const report = makeReport();
      report.tablet.payload = { ...report.tablet.payload, enSala: false };
      expect(formatSummary(report)).toContain('en sala no (servidor: sí)');
    });
  });

  describe('línea mismatch', () => {
    it('warns with both values only when mismatched', () => {
      const mismatched = formatSummary(makeReport({ lineaMismatch: true, clientLineaId: 7 }));
      expect(mismatched).toContain('lineaId del cliente (7) distinto del servidor (3)');
      expect(formatSummary(makeReport())).not.toContain('distinto del servidor');
    });

    it('prints "null" for a null client lineaId', () => {
      const mismatched = formatSummary(makeReport({ lineaMismatch: true, clientLineaId: null }));
      expect(mismatched).toContain('lineaId del cliente (null)');
    });
  });

  it('ends with report id and ISO timestamp, pointing to the attachment', () => {
    const summary = formatSummary(makeReport());
    expect(summary).toContain('Reporte ab12cd34 · 2026-10-16T12:00:00.000Z · detalle completo en adjunto');
  });
});

describe('formatAttachment', () => {
  it('lists all 100 backend frames, 100 RB raw frames and 50 RB logs', () => {
    const text = formatAttachment(makeReport());
    expect(text).toContain('== Tramas backend (100) ==');
    expect(text).toContain('== RB tramas crudas (100) ==');
    expect(text).toContain('== RB logs (50) ==');
    expect(text.match(/\| (aceptada|descartada:sin-sesion)$/gm)).toHaveLength(100);
    expect(text).toContain('RAW-0');
    expect(text).toContain('RAW-99');
    expect(text).toContain('linea-de-log-0');
    expect(text).toContain('linea-de-log-49');
  });

  it('lists backend frames oldest to newest with ISO time, value, unit and result', () => {
    const lines = formatAttachment(makeReport()).split('\n');
    const idx = lines.findIndex((l) => l.startsWith('== Tramas backend'));
    expect(lines[idx + 1]).toBe(`${new Date(ACCEPTED_AT - 100_000).toISOString()} | 1000 | g | aceptada`);
    expect(lines[idx + 2]).toContain('| 1001 | g | descartada:sin-sesion');
  });

  it('includes every section header', () => {
    const text = formatAttachment(makeReport());
    for (const header of ['== Resumen ==', '== Tablet ==', '== Sesión ==', '== Backend ==', '== RB ==']) {
      expect(text).toContain(header);
    }
  });

  it('includes the full operator detail including usuario and nombreUsuario', () => {
    const text = formatAttachment(makeReport());
    expect(text).toContain('legajo: 123');
    expect(text).toContain('nombreApellido: Ana Pérez');
    expect(text).toContain('nombreUsuario: aperez');
    expect(text).toContain('usuarioId: 42');
  });

  it('includes the tablet payload as JSON', () => {
    const text = formatAttachment(makeReport());
    expect(text).toContain('"ultimoPeso": 45.2');
    expect(text).toContain('"pantalla": "tablet"');
  });

  it('JSON-escapes raw RB frames so control characters cannot break the layout', () => {
    const diag = makeDiag({ tramasCrudas: [{ t: ACCEPTED_AT, raw: 'a"b\nc\u0002' }] });
    const text = formatAttachment(withRb({ estado: 'ok', diag }));
    expect(text).toContain(JSON.stringify('a"b\nc\u0002'));
    expect(text).not.toContain('a"b\nc');
  });

  it('keeps the mismatch note and session-less explanation', () => {
    const text = formatAttachment(makeReport({ lineaMismatch: true, clientLineaId: 7, sesion: { estado: 'sin-sesion' } }));
    expect(text).toContain('lineaId del cliente (7) distinto del servidor (3)');
    expect(text).toContain('Sin sesión activa');
  });

  it('writes the RB state text instead of data when the RB did not answer', () => {
    const text = formatAttachment(withRb({ estado: 'sin-respuesta' }));
    expect(text).toContain('RB no respondió en 3 s (versión sin soporte o sin conexión)');
    expect(text).not.toContain('== RB tramas crudas');
  });

  it('caps the attachment size', () => {
    const huge = 'x'.repeat(400);
    const diag = makeDiag({
      logs: Array.from({ length: 100 }, () => huge),
      tramasCrudas: Array.from({ length: 200 }, (_, i) => ({ t: i, raw: huge.slice(0, 200) })),
    });
    const frames = makeFrames(100);
    const report = makeReport({ rb: { estado: 'invalida', raw: 'y'.repeat(4000) }, frames });
    // A size-capped attachment must never exceed the limit even with oversized inputs.
    const text = formatAttachment({ ...report, rb: { estado: 'ok', diag }, backend: { lineaNombre: 'L'.repeat(ATTACHMENT_MAX_LENGTH) } });
    expect(text.length).toBeLessThanOrEqual(ATTACHMENT_MAX_LENGTH);
    expect(ATTACHMENT_MAX_LENGTH).toBe(256 * 1024);
  });
});

describe('attachmentFilename', () => {
  it('follows reporte-sin-peso-linea-<id>-<UTC timestamp>-<reportId>.txt', () => {
    expect(attachmentFilename(makeReport())).toBe('reporte-sin-peso-linea-3-20261016T120000-ab12cd34.txt');
  });

  it('only contains filename-safe characters', () => {
    expect(attachmentFilename(makeReport({ reportId: 'a/b c' }))).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});
