import { describe, it, expect, vi } from 'vitest';
import type { Socket } from 'socket.io';
import type { WeightIssueReporter } from '../services/weight-issue-report.service.js';
import { registerWeightIssueReportHandler } from './weight-issue-report.handler.js';

const makeSocket = () => ({ on: vi.fn() }) as unknown as Socket;

const getHandler = (socket: Socket, event: string) =>
  (socket.on as ReturnType<typeof vi.fn>).mock.calls.find(([e]) => e === event)?.[1] as
    | ((payload: unknown, ack?: unknown) => void)
    | undefined;

const makeReporter = (completion: Promise<void> = Promise.resolve()) => {
  const submit = vi.fn().mockReturnValue({ ack: { ok: true, code: 'sent' }, completion });
  return { reporter: { submit } as unknown as WeightIssueReporter, submit };
};

describe('registerWeightIssueReportHandler', () => {
  it("registers the 'reportar-sin-peso' event", () => {
    const socket = makeSocket();
    registerWeightIssueReportHandler(socket, makeReporter().reporter);
    expect(socket.on).toHaveBeenCalledWith('reportar-sin-peso', expect.any(Function));
  });

  it('submits the payload for this socket and answers with the ack from submit()', () => {
    const socket = makeSocket();
    const { reporter, submit } = makeReporter();
    registerWeightIssueReportHandler(socket, reporter);
    const ack = vi.fn();
    getHandler(socket, 'reportar-sin-peso')!({ v: 1 }, ack);
    expect(submit).toHaveBeenCalledWith(socket, { v: 1 });
    expect(ack).toHaveBeenCalledOnce();
    expect(ack).toHaveBeenCalledWith({ ok: true, code: 'sent' });
  });

  it('does not throw when the client sends no ack function', () => {
    const socket = makeSocket();
    const { reporter, submit } = makeReporter();
    registerWeightIssueReportHandler(socket, reporter);
    const handler = getHandler(socket, 'reportar-sin-peso')!;
    expect(() => handler({ v: 1 })).not.toThrow();
    expect(() => handler({ v: 1 }, 'not-a-function')).not.toThrow();
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it('acks right away and does not wait for the completion', () => {
    const socket = makeSocket();
    const { reporter } = makeReporter(new Promise(() => {}));
    registerWeightIssueReportHandler(socket, reporter);
    const ack = vi.fn();
    getHandler(socket, 'reportar-sin-peso')!({ v: 1 }, ack);
    expect(ack).toHaveBeenCalledOnce();
  });

  it('never throws into the socket layer when submit() or the ack callback throws', () => {
    const socket = makeSocket();
    const submit = vi.fn(() => {
      throw new Error('boom');
    });
    registerWeightIssueReportHandler(socket, { submit } as unknown as WeightIssueReporter);
    const handler = getHandler(socket, 'reportar-sin-peso')!;
    const ack = vi.fn();
    expect(() => handler({ v: 1 }, ack)).not.toThrow();
    expect(ack).toHaveBeenCalledWith({ ok: false, code: 'error' });

    const { reporter } = makeReporter();
    const socket2 = makeSocket();
    registerWeightIssueReportHandler(socket2, reporter);
    expect(() =>
      getHandler(socket2, 'reportar-sin-peso')!({ v: 1 }, () => {
        throw new Error('ack boom');
      }),
    ).not.toThrow();
  });
});
