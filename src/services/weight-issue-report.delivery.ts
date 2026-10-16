import type { DiscordMessage, DiscordNotifier, DiscordSendResult } from './discord-notifier.service.js';

/** Total attempts per report; retries happen only after a failure. */
export const MAX_ATTEMPTS = 4;
/** Fixed waits before attempts 2, 3 and 4. No deadline and no Retry-After handling by design. */
export const WAITS_MS: readonly number[] = [2_000, 5_000, 10_000];
/** Attempts up to this number carry the attachment; later ones are summary-only. */
const ATTACHMENT_ATTEMPTS = 2;
/** Discord content cap used by the notifier; the omitted note must fit inside it. */
const MAX_CONTENT_LENGTH = 1900;
export const ATTACHMENT_OMITTED_NOTE = '\n(adjunto omitido: falló el envío con archivo)';

type DeliveryLogger = Pick<Console, 'log' | 'warn' | 'error'>;

export interface DeliveryContext {
  reportId: string;
  lineaId: number;
}

export interface DeliveryDeps {
  sleep?: (ms: number) => Promise<void>;
  log?: DeliveryLogger;
  /** Monotonic-ish clock in ms, only used for the per-attempt duration. */
  now?: () => number;
}

type DeliveryMode = 'attachment' | 'summary-only';

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const summaryOnly = (message: DiscordMessage): DiscordMessage => {
  if (message.attachment === undefined) return { content: message.content };
  const room = MAX_CONTENT_LENGTH - ATTACHMENT_OMITTED_NOTE.length;
  return { content: message.content.slice(0, room) + ATTACHMENT_OMITTED_NOTE };
};

/** A notifier that breaks its never-throw contract is treated as a network failure. */
const sendSafely = async (notifier: Pick<DiscordNotifier, 'send'>, message: DiscordMessage): Promise<DiscordSendResult> => {
  try {
    return await notifier.send(message);
  } catch (err) {
    return { ok: false, kind: 'network', errorName: err instanceof Error ? err.name : 'UnknownError' };
  }
};

const describeResult = (r: DiscordSendResult): { result: string; status: string; error: string } => {
  if (r.ok) return { result: 'ok', status: String(r.status), error: '-' };
  if (r.kind === 'http') return { result: 'http', status: String(r.status), error: '-' };
  if (r.kind === 'not-configured') return { result: 'not-configured', status: '-', error: '-' };
  return { result: r.kind, status: '-', error: r.errorName };
};

/**
 * Delivers one report to Discord with up to 4 attempts. Only a failure
 * triggers another attempt; the first success stops the sequence. Never throws.
 *
 * Logs carry the report id, línea, attempt, result and HTTP status or error
 * name only: never the webhook URL, which can appear inside error messages.
 * Concurrent calls share no state, so overlapping reports are independent.
 */
export const deliverReport = async (
  notifier: Pick<DiscordNotifier, 'send'>,
  message: DiscordMessage,
  ctx: DeliveryContext,
  deps: DeliveryDeps = {},
): Promise<void> => {
  const sleep = deps.sleep ?? defaultSleep;
  const logger: DeliveryLogger = deps.log ?? console;
  const now = deps.now ?? Date.now;
  const prefix = `[weight-report] report=${ctx.reportId} linea=${ctx.lineaId}`;
  // A broken logger must not turn into an exception for the caller.
  const emit = (level: keyof DeliveryLogger, text: string): void => {
    try {
      logger[level](text);
    } catch {
      /* logging is best effort */
    }
  };

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const mode: DeliveryMode =
        attempt <= ATTACHMENT_ATTEMPTS && message.attachment !== undefined ? 'attachment' : 'summary-only';
      const started = now();
      const result = await sendSafely(notifier, mode === 'attachment' ? message : summaryOnly(message));
      const durationMs = now() - started;

      if (!result.ok && result.kind === 'not-configured') {
        emit('warn', `${prefix} DISCORD_WEBHOOK_URL not configured; full summary follows:\n${message.content}`);
        return;
      }

      const { result: outcome, status, error } = describeResult(result);
      emit(
        result.ok ? 'log' : 'warn',
        `${prefix} discord attempt ${attempt}/${MAX_ATTEMPTS} mode=${mode} result=${outcome} status=${status} error=${error} durationMs=${durationMs}`,
      );
      if (result.ok) return;
      if (attempt < MAX_ATTEMPTS) await sleep(WAITS_MS[attempt - 1]);
    }
    emit('error', `${prefix} discord delivery FAILED after ${MAX_ATTEMPTS}/${MAX_ATTEMPTS} attempts; full summary follows:\n${message.content}`);
  } catch (err) {
    emit('error', `${prefix} unexpected delivery error (${err instanceof Error ? err.name : 'UnknownError'})`);
  }
};
