import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { BalanzaFlowMonitor, type AlertContext } from './balanza-flow-monitor.service.js';
import type { SesionActiva } from './sesion.service.js';

const SILENCE = 120_000;
const COOLDOWN = 1_800_000;

const makeSesion = (lineaId: number, overrides: Partial<SesionActiva> = {}): SesionActiva => ({
  lineaProduccionId: lineaId,
  usuarioId: 1,
  usuarioRol: null,
  pasadaId: null,
  connectedAt: new Date(0),
  ultimaActividadAt: null,
  warningSent: false,
  ...overrides,
});

describe('BalanzaFlowMonitor', () => {
  let nowMs: number;
  let sessions: Map<number, SesionActiva>;
  let notify: Mock<(content: string) => Promise<void>>;
  let resolveContext: Mock<(lineaId: number) => Promise<AlertContext>>;
  let monitor: BalanzaFlowMonitor;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  const sesionService = {
    obtenerTodasLasSesiones: () => Array.from(sessions.values()),
    obtenerSesion: (id: number) => sessions.get(id) ?? null,
  };

  beforeEach(() => {
    nowMs = 1_000_000;
    sessions = new Map();
    notify = vi.fn<(content: string) => Promise<void>>().mockResolvedValue(undefined);
    const ctx: AlertContext = {
      lineaNombre: 'Linea 1',
      rbNombre: 'RB-05',
      rbHardwareId: 'hw-5',
      rbConnected: true,
      tabletSockets: 2,
    };
    resolveContext = vi.fn<(lineaId: number) => Promise<AlertContext>>().mockResolvedValue(ctx);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    monitor = new BalanzaFlowMonitor({
      sesionService,
      notify,
      resolveContext,
      now: () => nowMs,
      silenceMs: SILENCE,
      cooldownMs: COOLDOWN,
    });
  });

  afterEach(() => vi.restoreAllMocks());

  const startSession = (id: number, overrides: Partial<SesionActiva> = {}) =>
    sessions.set(id, makeSesion(id, { connectedAt: new Date(nowMs), ...overrides }));

  it('does not alert while frames keep arriving', async () => {
    startSession(1);
    for (let i = 0; i < 10; i++) {
      nowMs += 30_000;
      monitor.recordAcceptedFrame(1);
      await monitor.check();
    }
    expect(notify).not.toHaveBeenCalled();
  });

  it('alerts after silenceMs without accepted frames on an active user session', async () => {
    startSession(1);
    monitor.recordAcceptedFrame(1);
    nowMs += SILENCE + 1;
    await monitor.check();
    expect(notify).toHaveBeenCalledTimes(1);
    const msg = notify.mock.calls[0][0] as string;
    expect(msg).toContain('Linea 1');
    expect(msg).toContain('RB-05');
    expect(msg).toContain('hw-5');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('does not alert before silenceMs', async () => {
    startSession(1);
    nowMs += SILENCE - 1;
    await monitor.check();
    expect(notify).not.toHaveBeenCalled();
  });

  it('never alerts without a session or with a puesta a punto session (usuarioId null)', async () => {
    startSession(2, { usuarioId: null });
    nowMs += SILENCE * 10;
    await monitor.check();
    expect(notify).not.toHaveBeenCalled();
  });

  it('gives a new session a grace period measured from connectedAt', async () => {
    monitor.recordAcceptedFrame(1); // old frame, long ago
    nowMs += SILENCE * 5;
    startSession(1); // new session starts now
    nowMs += SILENCE - 1;
    await monitor.check();
    expect(notify).not.toHaveBeenCalled();
    nowMs += 2;
    await monitor.check();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('alerts once per línea until recovery', async () => {
    startSession(1);
    nowMs += SILENCE + 1;
    await monitor.check();
    nowMs += 60_000;
    await monitor.check();
    nowMs += 60_000;
    await monitor.check();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('alerts each línea independently', async () => {
    startSession(1);
    startSession(2);
    nowMs += SILENCE + 1;
    await monitor.check();
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('re-alerts after the cooldown when still failing', async () => {
    startSession(1);
    nowMs += SILENCE + 1;
    await monitor.check();
    nowMs += COOLDOWN - 1;
    await monitor.check();
    expect(notify).toHaveBeenCalledTimes(1);
    nowMs += 2;
    await monitor.check();
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('sends exactly one recovery message when frames are accepted again, then clears state', async () => {
    startSession(1);
    nowMs += SILENCE + 1;
    await monitor.check();
    notify.mockClear();

    monitor.recordAcceptedFrame(1);
    monitor.recordAcceptedFrame(1);
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(notify.mock.calls[0][0]).toMatch(/recuper|normaliz/i);

    // State cleared: a new silence alerts again.
    nowMs += SILENCE + 1;
    await monitor.check();
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('does not send a recovery for a línea that never alerted', async () => {
    monitor.recordAcceptedFrame(1);
    await Promise.resolve();
    expect(notify).not.toHaveBeenCalled();
  });

  it('includes the last discard reason, or "ninguno"', async () => {
    startSession(1);
    startSession(2);
    monitor.recordDiscard(1, 'sin-unidad');
    nowMs += SILENCE + 1;
    await monitor.check();
    const byLinea = notify.mock.calls.map((c) => c[0] as string);
    expect(byLinea.some((m) => m.includes('sin-unidad'))).toBe(true);
    expect(byLinea.some((m) => m.includes('ninguno'))).toBe(true);
  });

  it('includes seconds since the last accepted frame, RB connection and tablet count', async () => {
    startSession(1);
    monitor.recordAcceptedFrame(1);
    nowMs += 150_000;
    await monitor.check();
    const msg = notify.mock.calls[0][0] as string;
    expect(msg).toContain('150');
    expect(msg).toMatch(/tablets?.*2/i);
    expect(msg).toMatch(/conectad/i);
  });

  it('still alerts when the resolver fails', async () => {
    resolveContext.mockRejectedValue(new Error('db down'));
    startSession(1);
    nowMs += SILENCE + 1;
    await monitor.check();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toContain('1');
  });

  it('check never throws, even if the session service or notifier fail', async () => {
    const broken = new BalanzaFlowMonitor({
      sesionService: {
        obtenerTodasLasSesiones: () => {
          throw new Error('boom');
        },
        obtenerSesion: () => null,
      },
      notify,
      now: () => nowMs,
    });
    await expect(broken.check()).resolves.toBeUndefined();

    notify.mockRejectedValue(new Error('discord down'));
    startSession(1);
    nowMs += SILENCE + 1;
    await expect(monitor.check()).resolves.toBeUndefined();
  });

  it('drops alert state when the session is gone, without a recovery message', async () => {
    startSession(1);
    nowMs += SILENCE + 1;
    await monitor.check();
    notify.mockClear();
    sessions.delete(1);
    await monitor.check();
    monitor.recordAcceptedFrame(1);
    await Promise.resolve();
    expect(notify).not.toHaveBeenCalled();
  });
});
