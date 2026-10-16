import type { Socket } from 'socket.io';
import type { ReportAck } from '../services/weight-issue-report.schemas.js';
import type { WeightIssueReporter } from '../services/weight-issue-report.service.js';

const INTERNAL_ERROR_ACK: ReportAck = { ok: false, code: 'error' };

/**
 * Registers `reportar-sin-peso`. The ack is returned as soon as the reporter
 * accepts (or rejects) the report; the diagnostic pipeline keeps running
 * in the background and its completion is intentionally not awaited.
 */
export const registerWeightIssueReportHandler = (socket: Socket, reporter: WeightIssueReporter): void => {
  socket.on('reportar-sin-peso', (payload: unknown, ack?: unknown) => {
    let ackPayload: ReportAck = INTERNAL_ERROR_ACK;
    try {
      const result = reporter.submit(socket, payload);
      ackPayload = result.ack;
      void result.completion;
    } catch (err) {
      console.error(`[weight-report] handler failed (${err instanceof Error ? err.name : 'UnknownError'})`);
    }
    if (typeof ack !== 'function') return;
    try {
      ack(ackPayload);
    } catch (err) {
      console.error(`[weight-report] ack callback failed (${err instanceof Error ? err.name : 'UnknownError'})`);
    }
  });
};
