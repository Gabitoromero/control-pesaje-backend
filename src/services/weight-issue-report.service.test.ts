import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import type { Socket } from 'socket.io';
import { Usuario } from '../models/Usuario.js';
import { createWeightIssueReporter, type WeightIssueReporterDeps } from './weight-issue-report.service.js';
import type { FrameEntry } from './balanza-frame-ring.service.js';

const T0 = 1_700_000_000_000;

const validPayload = {
  v: 1,
  lineaId: 5,
  ultimoPeso: 45.2,
  ultimoPesoHaceMs: 12_000,
  unidad: 'kg',
  socketConectado: true,
  balanzaConectada: true,
  enSala: true,
  pantalla: 'tablet',
  clientTs: T0,
};

const rbOk = {
  v: 1,
  version: 'abc1234',
  serial: { abierto: true, path: '/dev/ttyUSB0', baud: 9600, ultimoByteHaceMs: 500 },
  contadores: { bytes: 1000, validas: 90, descartadas: 10, ultimaDescartada: null },
  tramasCrudas: Array.from({ length: 100 }, (_, i) => ({ t: T0 - i, raw: `frame-${i}` })),
  logs: ['log line'],
};

const frame = (pesoNeto: number, extra: Partial<FrameEntry> = {}): FrameEntry => ({
  t: T0 - 1000,
  pesoNeto,
  unidad: 'kg',
  aceptada: true,
  ...extra,
});

const makeSocket = (data: Record<string, unknown> = {}, rooms: string[] = ['linea-5']) =>
  ({
    id: 'tablet-1',
    data: { user: { id: 1, rol: 'operario' }, lineaId: 5, ...data },
    rooms: new Set(rooms),
  }) as unknown as Socket;

interface Harness {
  deps: WeightIssueReporterDeps;
  reporter: ReturnType<typeof createWeightIssueReporter>;
  clock: { now: number };
  notifier: { send: ReturnType<typeof vi.fn> };
  sleep: ReturnType<typeof vi.fn>;
  emitWithAck: ReturnType<typeof vi.fn>;
  timeout: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  log: { log: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
}

interface HarnessOptions {
  device?: { socketId: string; hardwareId: string; unidad: string | null } | undefined;
  rbSocketMissing?: boolean;
  sesion?: Record<string, unknown> | null;
  rbResponse?: () => Promise<unknown>;
  findOne?: ReturnType<typeof vi.fn>;
  frames?: FrameEntry[];
  contextResolver?: WeightIssueReporterDeps['resolveLineaContext'];
}

const setup = (o: HarnessOptions = {}): Harness => {
  const clock = { now: T0 };
  const emitWithAck = vi.fn(o.rbResponse ?? (() => Promise.resolve(rbOk)));
  const timeout = vi.fn(() => ({ emitWithAck }));
  const device = 'device' in o ? o.device : { socketId: 'rb-1', hardwareId: 'hw-1', unidad: 'kg' };
  const findOne = o.findOne ?? vi.fn().mockResolvedValue({ legajo: '123', nombreApellido: 'Ana Perez', nombreUsuario: 'aperez' });
  const sesion =
    o.sesion === undefined
      ? { lineaProduccionId: 5, usuarioId: 42, usuarioRol: null, pasadaId: null, connectedAt: new Date(T0 - 60_000), ultimaActividadAt: new Date(T0 - 10_000) }
      : o.sesion;
  const notifier = { send: vi.fn().mockResolvedValue({ ok: true, status: 204 }) };
  const sleep = vi.fn().mockResolvedValue(undefined);
  const log = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  let id = 0;
  const deps: WeightIssueReporterDeps = {
    io: { sockets: { sockets: new Map(o.rbSocketMissing ? [] : [['rb-1', { timeout }]]) } } as unknown as WeightIssueReporterDeps['io'],
    orm: { em: { fork: () => ({ findOne }) } } as unknown as WeightIssueReporterDeps['orm'],
    registry: { getDeviceForLinea: vi.fn().mockReturnValue(device) },
    sesion: { peekSesion: vi.fn().mockReturnValue(sesion), getInactivityTimeoutMs: () => 300_000 } as never,
    frameRing: { snapshot: vi.fn().mockReturnValue(o.frames ?? [frame(1.5)]) },
    resolveLineaContext: o.contextResolver ?? vi.fn().mockResolvedValue({ lineaNombre: 'Linea 5', rbConnected: true, rbSocketActivo: true, rbEnSala: true, tabletSockets: 1 }),
    notifier,
    now: () => clock.now,
    sleep,
    newReportId: () => `r${++id}`,
    log,
  };
  return { deps, reporter: createWeightIssueReporter(deps), clock, notifier, sleep, emitWithAck, timeout, findOne, log };
};

const sentMessage = (h: Harness) => h.notifier.send.mock.calls[0][0] as { content: string; attachment: { filename: string; text: string } };

describe('createWeightIssueReporter - submit (sync half)', () => {
  it.each([
    ['a device socket', { isDevice: true, user: undefined }],
    ['a socket without user', { user: undefined }],
  ])('answers forbidden for %s and does nothing else', async (_name, data) => {
    const h = setup();
    const r = h.reporter.submit(makeSocket(data), validPayload);
    expect(r.ack).toEqual({ ok: false, code: 'forbidden' });
    await r.completion;
    expect(h.notifier.send).not.toHaveBeenCalled();
    expect(h.emitWithAck).not.toHaveBeenCalled();
  });

  it('answers invalid-payload and does not consume the cooldown', async () => {
    const h = setup();
    const socket = makeSocket();
    expect(h.reporter.submit(socket, { v: 2 }).ack).toEqual({ ok: false, code: 'invalid-payload' });
    expect(h.reporter.submit(socket, 'nope').ack).toEqual({ ok: false, code: 'invalid-payload' });
    const ok = h.reporter.submit(socket, validPayload);
    expect(ok.ack).toEqual({ ok: true, code: 'sent' });
    await ok.completion;
  });

  it('answers no-linea when socket.data.lineaId is unset and does not consume the cooldown', async () => {
    const h = setup();
    const r = h.reporter.submit(makeSocket({ lineaId: undefined }), validPayload);
    expect(r.ack).toEqual({ ok: false, code: 'no-linea' });
    await r.completion;
    expect(h.notifier.send).not.toHaveBeenCalled();
    const ok = h.reporter.submit(makeSocket(), validPayload);
    expect(ok.ack).toEqual({ ok: true, code: 'sent' });
    await ok.completion;
  });

  it('accepts a report, then answers cooldown with the exact remaining time', async () => {
    const h = setup();
    const first = h.reporter.submit(makeSocket(), validPayload);
    expect(first.ack).toEqual({ ok: true, code: 'sent' });
    await first.completion;

    h.clock.now = T0 + 20_000;
    const second = h.reporter.submit(makeSocket(), validPayload);
    expect(second.ack).toEqual({ ok: false, code: 'cooldown', retryAfterMs: 40_000 });
    await second.completion;
    expect(h.notifier.send).toHaveBeenCalledTimes(1);
    expect(h.emitWithAck).toHaveBeenCalledTimes(1);
  });

  it('shares the cooldown between sockets of the same línea', async () => {
    const h = setup();
    await h.reporter.submit(makeSocket(), validPayload).completion;
    const other = { ...makeSocket(), id: 'tablet-2' } as Socket;
    expect(h.reporter.submit(other, validPayload).ack).toMatchObject({ ok: false, code: 'cooldown' });
  });

  it('does not block a different línea', async () => {
    const h = setup();
    await h.reporter.submit(makeSocket(), validPayload).completion;
    const r = h.reporter.submit(makeSocket({ lineaId: 6 }, ['linea-6']), { ...validPayload, lineaId: 6 });
    expect(r.ack).toEqual({ ok: true, code: 'sent' });
    await r.completion;
  });

  it('accepts again once the 60 s cooldown has elapsed', async () => {
    const h = setup();
    await h.reporter.submit(makeSocket(), validPayload).completion;
    h.clock.now = T0 + 59_999;
    expect(h.reporter.submit(makeSocket(), validPayload).ack).toEqual({ ok: false, code: 'cooldown', retryAfterMs: 1 });
    h.clock.now = T0 + 60_000;
    const r = h.reporter.submit(makeSocket(), validPayload);
    expect(r.ack).toEqual({ ok: true, code: 'sent' });
    await r.completion;
  });

  it('answers error without consuming the cooldown when the sync half throws', async () => {
    const h = setup();
    vi.mocked(h.deps.frameRing.snapshot).mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const failed = h.reporter.submit(makeSocket(), validPayload);
    expect(failed.ack).toEqual({ ok: false, code: 'error' });
    await expect(failed.completion).resolves.toBeUndefined();
    const ok = h.reporter.submit(makeSocket(), validPayload);
    expect(ok.ack).toEqual({ ok: true, code: 'sent' });
    await ok.completion;
  });

  it('acks immediately without waiting for the RB or Discord', async () => {
    const h = setup({ rbResponse: () => new Promise(() => {}) });
    const r = h.reporter.submit(makeSocket(), validPayload);
    expect(r.ack).toEqual({ ok: true, code: 'sent' });
    expect(h.notifier.send).not.toHaveBeenCalled();
  });

  it('uses the server línea and flags a client lineaId mismatch', async () => {
    const h = setup();
    await h.reporter.submit(makeSocket(), { ...validPayload, lineaId: 7 }).completion;
    expect(h.deps.registry.getDeviceForLinea).toHaveBeenCalledWith(5);
    expect(h.deps.frameRing.snapshot).toHaveBeenCalledWith(5);
    const { content } = sentMessage(h);
    expect(content).toContain('Línea Linea 5 (id 5)');
    expect(content).toContain('lineaId del cliente (7) distinto del servidor (5)');
    expect(h.notifier.send.mock.calls[0][0].attachment.filename).toContain('linea-5-');
  });

  it('logs accepted and rejected submissions without payload data', async () => {
    const h = setup();
    await h.reporter.submit(makeSocket(), validPayload).completion;
    expect(h.log.log).toHaveBeenCalledWith('[weight-report] report=r1 linea=5 accepted (pantalla=tablet)');
    h.reporter.submit(makeSocket(), { v: 2 });
    expect(h.log.warn).toHaveBeenCalledWith('[weight-report] rejected code=invalid-payload');
  });
});

describe('createWeightIssueReporter - async half', () => {
  it('delivers one message with the summary and the attachment', async () => {
    const h = setup();
    await h.reporter.submit(makeSocket(), validPayload).completion;
    expect(h.notifier.send).toHaveBeenCalledTimes(1);
    const { content, attachment } = sentMessage(h);
    expect(content).toContain('No veo el peso');
    expect(content).toContain('Operario: 123 Ana Perez');
    expect(attachment.filename).toMatch(/^reporte-sin-peso-linea-5-.*-r1\.txt$/);
    expect(attachment.text).toContain('aperez');
    expect(attachment.text).toContain('== Tramas backend (1) ==');
  });

  it('retries delivery with the injected sleep (delivery policy is wired)', async () => {
    const h = setup();
    h.notifier.send.mockResolvedValueOnce({ ok: false, kind: 'http', status: 500 });
    await h.reporter.submit(makeSocket(), validPayload).completion;
    expect(h.notifier.send).toHaveBeenCalledTimes(2);
    expect(h.sleep).toHaveBeenCalledWith(2000);
  });

  describe('RB diagnostic', () => {
    it('requests diagnostics with exactly {v:1} and a 3 s timeout, and includes the response', async () => {
      const h = setup();
      await h.reporter.submit(makeSocket(), validPayload).completion;
      expect(h.timeout).toHaveBeenCalledWith(3000);
      expect(h.emitWithAck).toHaveBeenCalledWith('diagnostico-solicitud', { v: 1 });
      expect(sentMessage(h).content).toContain('RB: versión abc1234');
      expect(sentMessage(h).attachment.text).toContain('== RB tramas crudas (100) ==');
    });

    it('never sends operator data to the RB', async () => {
      const h = setup();
      await h.reporter.submit(makeSocket(), validPayload).completion;
      const sent = JSON.stringify(h.emitWithAck.mock.calls);
      for (const secret of ['42', '123', 'Ana', 'aperez', 'usuarioId', 'legajo']) {
        expect(sent).not.toContain(secret);
      }
    });

    it('skips the request when no RB is paired', async () => {
      const h = setup({ device: undefined });
      await h.reporter.submit(makeSocket(), validPayload).completion;
      expect(h.emitWithAck).not.toHaveBeenCalled();
      expect(sentMessage(h).content).toContain('RB no conectada');
    });

    it('skips the request when the RB socket is not found', async () => {
      const h = setup({ rbSocketMissing: true });
      await h.reporter.submit(makeSocket(), validPayload).completion;
      expect(h.emitWithAck).not.toHaveBeenCalled();
      expect(sentMessage(h).content).toContain('Socket RB no encontrado');
    });

    it('reports sin-respuesta on timeout and still sends the report', async () => {
      const h = setup({ rbResponse: () => Promise.reject(new Error('operation has timed out')) });
      await h.reporter.submit(makeSocket(), validPayload).completion;
      expect(sentMessage(h).content).toContain('RB no respondió en 3 s (versión sin soporte o sin conexión)');
    });

    it('reports an unknown version with the raw response', async () => {
      const h = setup({ rbResponse: () => Promise.resolve({ v: 2, extra: true }) });
      await h.reporter.submit(makeSocket(), validPayload).completion;
      expect(sentMessage(h).content).toContain('Respuesta RB inválida (v=2)');
      expect(sentMessage(h).attachment.text).toContain('"extra":true');
    });

    it.each([['a non-object', 'garbage'], ['a malformed v1', { v: 1, version: 5 }]])(
      'reports an invalid response for %s',
      async (_name, response) => {
        const h = setup({ rbResponse: () => Promise.resolve(response) });
        await h.reporter.submit(makeSocket(), validPayload).completion;
        expect(sentMessage(h).content).toContain('Respuesta RB inválida');
        expect(sentMessage(h).content).not.toContain('RB: versión');
      },
    );
  });

  describe('operator', () => {
    it('looks the operator up through em.fork().findOne with explicit fields', async () => {
      const h = setup();
      await h.reporter.submit(makeSocket(), validPayload).completion;
      expect(h.findOne).toHaveBeenCalledWith(Usuario, { id: 42 }, { fields: ['legajo', 'nombreApellido', 'nombreUsuario'] });
    });

    it('reports puesta a punto without touching the DB when usuarioId is null', async () => {
      const h = setup({ sesion: { lineaProduccionId: 5, usuarioId: null, usuarioRol: null, pasadaId: null, connectedAt: new Date(T0), ultimaActividadAt: null } });
      await h.reporter.submit(makeSocket(), validPayload).completion;
      expect(h.findOne).not.toHaveBeenCalled();
      expect(sentMessage(h).content).toContain('puesta a punto');
    });

    it('reports sin sesión activa when there is no session', async () => {
      const h = setup({ sesion: null });
      await h.reporter.submit(makeSocket(), validPayload).completion;
      expect(h.findOne).not.toHaveBeenCalled();
      expect(sentMessage(h).content).toContain('Sin sesión activa');
    });

    it('flags an expired session using the idle time', async () => {
      const h = setup({ sesion: { lineaProduccionId: 5, usuarioId: 42, usuarioRol: null, pasadaId: null, connectedAt: new Date(T0 - 900_000), ultimaActividadAt: new Date(T0 - 400_000) } });
      await h.reporter.submit(makeSocket(), validPayload).completion;
      expect(sentMessage(h).content).toContain('sesión vencida por inactividad');
    });

    it('still delivers with the usuarioId when the lookup throws', async () => {
      const h = setup({ findOne: vi.fn().mockRejectedValue(new TypeError('db down')) });
      await h.reporter.submit(makeSocket(), validPayload).completion;
      expect(sentMessage(h).content).toContain('usuarioId 42 (legajo/nombre no disponibles: TypeError)');
    });

    it('still delivers with the usuarioId when the user is not found', async () => {
      const h = setup({ findOne: vi.fn().mockResolvedValue(null) });
      await h.reporter.submit(makeSocket(), validPayload).completion;
      expect(sentMessage(h).content).toContain('usuarioId 42 (legajo/nombre no disponibles: no encontrado)');
    });
  });

  it('still delivers when the línea context resolver fails', async () => {
    const h = setup({ contextResolver: () => Promise.reject(new Error('ctx down')) });
    await h.reporter.submit(makeSocket(), validPayload).completion;
    expect(h.notifier.send).toHaveBeenCalledTimes(1);
  });

  it('takes the evidence snapshot at submit time, not after the RB wait', async () => {
    let release: (v: unknown) => void = () => {};
    const h = setup({ rbResponse: () => new Promise((resolve) => (release = resolve)) });
    const r = h.reporter.submit(makeSocket(), validPayload);
    // State changes while the RB is still thinking.
    vi.mocked(h.deps.frameRing.snapshot).mockReturnValue([frame(99.9)]);
    vi.mocked(h.deps.sesion.peekSesion).mockReturnValue(null);
    vi.mocked(h.deps.registry.getDeviceForLinea).mockReturnValue(undefined);
    release(rbOk);
    await r.completion;
    const { content, attachment } = sentMessage(h);
    expect(attachment.text).toContain('1.5');
    expect(attachment.text).not.toContain('99.9');
    expect(content).toContain('Operario: 123 Ana Perez');
  });

  it('never rejects even when delivery and logging blow up', async () => {
    const h = setup();
    h.notifier.send.mockRejectedValue(new Error('send exploded'));
    h.log.log.mockImplementation(() => {
      throw new Error('log exploded');
    });
    await expect(h.reporter.submit(makeSocket(), validPayload).completion).resolves.toBeUndefined();
  });

  it('runs overlapping reports independently', async () => {
    const h = setup();
    h.notifier.send
      .mockResolvedValueOnce({ ok: false, kind: 'http', status: 500 })
      .mockResolvedValue({ ok: true, status: 204 });
    let releaseSleep: () => void = () => {};
    h.sleep.mockImplementationOnce(() => new Promise<void>((resolve) => (releaseSleep = resolve)));

    const a = h.reporter.submit(makeSocket(), validPayload);
    await vi.waitFor(() => expect(h.sleep).toHaveBeenCalledTimes(1));

    const b = h.reporter.submit(makeSocket({ lineaId: 6 }, ['linea-6']), { ...validPayload, lineaId: 6 });
    expect(b.ack).toEqual({ ok: true, code: 'sent' });
    await b.completion;
    // B completed while A is still waiting for its retry.
    expect(h.notifier.send).toHaveBeenCalledTimes(2);

    releaseSleep();
    await a.completion;
    expect(h.notifier.send).toHaveBeenCalledTimes(3);
  });
});
