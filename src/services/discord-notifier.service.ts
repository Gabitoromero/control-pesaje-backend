/** Discord caps message content at 2000 chars; keep a margin. */
const MAX_CONTENT_LENGTH = 1900;

export interface DiscordAttachment {
  filename: string;
  text: string;
}

export interface DiscordMessage {
  content: string;
  attachment?: DiscordAttachment;
}

export type DiscordSendResult =
  | { ok: true; status: number }
  | { ok: false; kind: 'not-configured' }
  | { ok: false; kind: 'http'; status: number }
  | { ok: false; kind: 'timeout' | 'network'; errorName: string };

export interface DiscordNotifier {
  /** Single attempt, typed result. Never throws and never logs. */
  send(message: DiscordMessage): Promise<DiscordSendResult>;
  /** Fire-and-forget plain message; logs failures without the URL. */
  notify(content: string): Promise<void>;
}

export interface DiscordNotifierOptions {
  webhookUrl?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/** Empty `parse` prevents @everyone/role/user pings from names or log text. */
const NO_MENTIONS = { parse: [] as string[] };

const buildRequestInit = (message: DiscordMessage, signal: AbortSignal): RequestInit => {
  const content = message.content.slice(0, MAX_CONTENT_LENGTH);
  const { attachment } = message;
  if (attachment === undefined) {
    return {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, allowed_mentions: NO_MENTIONS }),
      signal,
    };
  }
  // No manual Content-Type: fetch sets multipart/form-data with its boundary.
  const form = new FormData();
  form.append(
    'payload_json',
    JSON.stringify({
      content,
      allowed_mentions: NO_MENTIONS,
      attachments: [{ id: 0, filename: attachment.filename }],
    }),
  );
  form.append('files[0]', new Blob([attachment.text], { type: 'text/plain; charset=utf-8' }), attachment.filename);
  return { method: 'POST', body: form, signal };
};

/**
 * Minimal Discord webhook client. Never throws: alerting must not be able to
 * affect the caller. The webhook URL is a secret and is never logged.
 */
export const createDiscordNotifier = ({
  webhookUrl,
  fetchFn = fetch,
  timeoutMs = 5000,
}: DiscordNotifierOptions): DiscordNotifier => {
  const url = webhookUrl?.trim();

  const send = async (message: DiscordMessage): Promise<DiscordSendResult> => {
    if (!url) return { ok: false, kind: 'not-configured' };
    try {
      const res = await fetchFn(url, buildRequestInit(message, AbortSignal.timeout(timeoutMs)));
      return res.ok ? { ok: true, status: res.status } : { ok: false, kind: 'http', status: res.status };
    } catch (err) {
      const errorName = err instanceof Error ? err.name : 'UnknownError';
      const kind = errorName === 'TimeoutError' || errorName === 'AbortError' ? 'timeout' : 'network';
      return { ok: false, kind, errorName };
    }
  };

  return {
    send,
    async notify(content: string): Promise<void> {
      const result = await send({ content });
      if (result.ok || result.kind === 'not-configured') return;
      if (result.kind === 'http') {
        console.error(`[discord] Webhook responded with HTTP ${result.status}`);
      } else {
        console.error(`[discord] Failed to send notification (${result.errorName})`);
      }
    },
  };
};
