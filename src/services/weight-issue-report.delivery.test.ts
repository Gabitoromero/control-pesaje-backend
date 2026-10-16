import { describe, it, expect, vi } from 'vitest';
import {
  deliverReport,
  MAX_ATTEMPTS,
  WAITS_MS,
  ATTACHMENT_OMITTED_NOTE,
  type DeliveryContext,
  type DeliveryDeps,
} from './weight-issue-report.delivery.js';
import type { DiscordMessage, DiscordNotifier, DiscordSendResult } from './discord-notifier.service.js';

const WEBHOOK_URL = 'https://discord.com/api/webhooks/123456/SECRET-TOKEN';

const ok: DiscordSendResult = { ok: true, status: 204 };
const http = (status: number): DiscordSendResult => ({ ok: false, kind: 'http', status });

const message: DiscordMessage = {
  content: 'SUMMARY-CONTENT',
  attachment: { filename: 'reporte.txt', text: 'FULL-DETAIL' },
};
const ctx: DeliveryContext = { reportId: 'ab12cd34', lineaId: 3 };

const makeNotifier = (...results: DiscordSendResult[]) => {
  const send = vi.fn<DiscordNotifier['send']>();
  results.forEach((r) => send.mockResolvedValueOnce(r));
  // Anything beyond the scripted results fails, so over-retrying is visible.
  send.mockResolvedValue(http(599));
  return { send } satisfies Pick<DiscordNotifier, 'send'>;
};

const makeDeps = () => {
  const sleeps: number[] = [];
  const log = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  let clock = 0;
  const deps: DeliveryDeps = {
    sleep: vi.fn(async (ms: number) => {
      sleeps.push(ms);
    }),
    log,
    now: () => (clock += 10),
  };
  return { deps, sleeps, log };
};

const allOutput = (log: ReturnType<typeof makeDeps>['log']): string =>
  [log.log, log.warn, log.error].flatMap((fn) => fn.mock.calls.map((c) => c.join(' '))).join('\n');

describe('deliverReport', () => {
  it('has the documented retry policy constants', () => {
    expect(MAX_ATTEMPTS).toBe(4);
    expect(WAITS_MS).toEqual([2000, 5000, 10000]);
  });

  it('succeeds on the first attempt: one call with the attachment, no sleep, one log line', async () => {
    const notifier = makeNotifier(ok);
    const { deps, sleeps, log } = makeDeps();

    await deliverReport(notifier, message, ctx, deps);

    expect(notifier.send).toHaveBeenCalledTimes(1);
    expect(notifier.send).toHaveBeenCalledWith(message);
    expect(sleeps).toEqual([]);
    expect(log.log).toHaveBeenCalledTimes(1);
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it('retries only after a failure and stops at the first success', async () => {
    const notifier = makeNotifier(http(500), ok);
    const { deps, sleeps, log } = makeDeps();

    await deliverReport(notifier, message, ctx, deps);

    expect(notifier.send).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([2000]);
    expect(log.warn.mock.calls[0][0]).toContain('attempt 1/4');
    expect(log.warn.mock.calls[0][0]).toContain('status=500');
    expect(log.log.mock.calls[0][0]).toContain('attempt 2/4');
    expect(log.error).not.toHaveBeenCalled();
  });

  it('after 4 failures: 4 calls, modes attachment x2 then summary-only x2, waits 2/5/10 s, full summary logged', async () => {
    const notifier = makeNotifier(http(500), http(500), http(500), http(500));
    const { deps, sleeps, log } = makeDeps();

    await deliverReport(notifier, message, ctx, deps);

    expect(notifier.send).toHaveBeenCalledTimes(4);
    const calls = notifier.send.mock.calls.map(([m]) => m);
    expect(calls[0].attachment).toEqual(message.attachment);
    expect(calls[1].attachment).toEqual(message.attachment);
    expect(calls[2].attachment).toBeUndefined();
    expect(calls[3].attachment).toBeUndefined();
    expect(sleeps).toEqual([2000, 5000, 10000]);
    expect(log.warn).toHaveBeenCalledTimes(4);
    expect(log.error).toHaveBeenCalledTimes(1);
    const finalLog = String(log.error.mock.calls[0][0]);
    expect(finalLog).toContain('delivery FAILED after 4/4 attempts');
    expect(finalLog).toContain('report=ab12cd34');
    expect(finalLog).toContain('SUMMARY-CONTENT');
  });

  it('summary-only attempts keep the summary and note that the attachment was omitted, within 1900 chars', async () => {
    const longSummary = 'S'.repeat(1900);
    const notifier = makeNotifier(http(400), http(400), ok);
    const { deps } = makeDeps();

    await deliverReport(notifier, { content: longSummary, attachment: message.attachment }, ctx, deps);

    const third = notifier.send.mock.calls[2][0];
    expect(third.attachment).toBeUndefined();
    expect(third.content).toContain(ATTACHMENT_OMITTED_NOTE);
    expect(third.content.length).toBeLessThanOrEqual(1900);
    expect(third.content.startsWith('SSSS')).toBe(true);
    // Attachment attempts must not carry the note.
    expect(notifier.send.mock.calls[0][0].content).toBe(longSummary);
  });

  it('a message without attachment is always sent as summary-only, without the omitted note', async () => {
    const notifier = makeNotifier(http(500), ok);
    const { deps, log } = makeDeps();

    await deliverReport(notifier, { content: 'solo resumen' }, ctx, deps);

    expect(notifier.send.mock.calls[0][0]).toEqual({ content: 'solo resumen' });
    expect(log.warn.mock.calls[0][0]).toContain('mode=summary-only');
  });

  it('treats 429 like any other failure: same waits, no Retry-After handling', async () => {
    const notifier = makeNotifier(http(429), http(429), http(429), ok);
    const { deps, sleeps, log } = makeDeps();

    await deliverReport(notifier, message, ctx, deps);

    expect(notifier.send).toHaveBeenCalledTimes(4);
    expect(sleeps).toEqual([2000, 5000, 10000]);
    expect(log.warn.mock.calls[0][0]).toContain('status=429');
  });

  it('does not retry when the webhook is not configured and logs the full summary', async () => {
    const notifier = makeNotifier({ ok: false, kind: 'not-configured' });
    const { deps, sleeps, log } = makeDeps();

    await deliverReport(notifier, message, ctx, deps);

    expect(notifier.send).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
    const output = allOutput(log);
    expect(output).toContain('DISCORD_WEBHOOK_URL not configured');
    expect(output).toContain('SUMMARY-CONTENT');
    expect(output).toContain('report=ab12cd34');
  });

  it('logs every attempt with the documented format', async () => {
    const notifier = makeNotifier(
      http(500),
      { ok: false, kind: 'timeout', errorName: 'TimeoutError' },
      { ok: false, kind: 'network', errorName: 'TypeError' },
      ok,
    );
    const { deps, log } = makeDeps();

    await deliverReport(notifier, message, ctx, deps);

    const lines = [...log.warn.mock.calls, ...log.log.mock.calls].map((c) => String(c[0]));
    const shape =
      /^\[weight-report\] report=ab12cd34 linea=3 discord attempt [1-4]\/4 mode=(attachment|summary-only) result=(ok|http|timeout|network) status=(\d+|-) error=([A-Za-z]+|-) durationMs=\d+$/;
    expect(lines).toHaveLength(4);
    for (const line of lines) expect(line).toMatch(shape);
    expect(lines).toContain(
      '[weight-report] report=ab12cd34 linea=3 discord attempt 1/4 mode=attachment result=http status=500 error=- durationMs=10',
    );
    expect(lines.find((l) => l.includes('attempt 2/4'))).toContain('result=timeout status=- error=TimeoutError');
    expect(lines.find((l) => l.includes('attempt 3/4'))).toContain('mode=summary-only result=network status=- error=TypeError');
    expect(lines.find((l) => l.includes('attempt 4/4'))).toContain('result=ok status=204 error=-');
  });

  it('never logs the webhook URL even when the notifier throws an error that contains it', async () => {
    const send = vi.fn<DiscordNotifier['send']>().mockRejectedValue(new TypeError(`fetch failed for ${WEBHOOK_URL}`));
    const { deps, log } = makeDeps();

    await expect(deliverReport({ send }, message, ctx, deps)).resolves.toBeUndefined();

    const output = allOutput(log);
    expect(output).not.toContain(WEBHOOK_URL);
    expect(output).not.toContain('SECRET-TOKEN');
    expect(send).toHaveBeenCalledTimes(4);
    expect(output).toContain('error=TypeError');
  });

  it('never throws, even if the logger itself throws', async () => {
    const notifier = makeNotifier(http(500), http(500), http(500), http(500));
    const { deps } = makeDeps();
    const boom = vi.fn(() => {
      throw new Error('logger down');
    });
    deps.log = { log: boom, warn: boom, error: boom };

    await expect(deliverReport(notifier, message, ctx, deps)).resolves.toBeUndefined();
  });

  it('runs two deliveries concurrently without sharing state', async () => {
    const notifierA = makeNotifier(http(500), http(500), http(500), http(500));
    const notifierB = makeNotifier(ok);
    const a = makeDeps();
    const b = makeDeps();

    await Promise.all([
      deliverReport(notifierA, message, { reportId: 'aaaaaaaa', lineaId: 3 }, a.deps),
      deliverReport(notifierB, { content: 'B' }, { reportId: 'bbbbbbbb', lineaId: 4 }, b.deps),
    ]);

    expect(notifierA.send).toHaveBeenCalledTimes(4);
    expect(a.sleeps).toEqual([2000, 5000, 10000]);
    expect(notifierB.send).toHaveBeenCalledTimes(1);
    expect(b.sleeps).toEqual([]);
    expect(allOutput(a.log)).not.toContain('bbbbbbbb');
    expect(allOutput(b.log)).not.toContain('aaaaaaaa');
    expect(b.log.error).not.toHaveBeenCalled();
  });

  it('does not wait for a slow earlier delivery when a second one starts (no queueing)', async () => {
    const releases: Array<() => void> = [];
    const slow = { send: vi.fn<DiscordNotifier['send']>().mockImplementation(() => new Promise((r) => releases.push(() => r(ok)))) };
    const fast = makeNotifier(ok);
    const { deps } = makeDeps();

    const first = deliverReport(slow, message, ctx, deps);
    await deliverReport(fast, message, { reportId: 'cccccccc', lineaId: 4 }, makeDeps().deps);

    expect(fast.send).toHaveBeenCalledTimes(1);
    releases[0]();
    await first;
    expect(slow.send).toHaveBeenCalledTimes(1);
  });
});
