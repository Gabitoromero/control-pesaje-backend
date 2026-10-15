/** Discord caps message content at 2000 chars; keep a margin. */
const MAX_CONTENT_LENGTH = 1900;

export interface DiscordNotifier {
  notify(content: string): Promise<void>;
}

export interface DiscordNotifierOptions {
  webhookUrl?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

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
  return {
    async notify(content: string): Promise<void> {
      if (!url) return;
      try {
        const res = await fetchFn(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: content.slice(0, MAX_CONTENT_LENGTH) }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
          console.error(`[discord] Webhook responded with HTTP ${res.status}`);
        }
      } catch (err) {
        const name = err instanceof Error ? err.name : 'UnknownError';
        console.error(`[discord] Failed to send notification (${name})`);
      }
    },
  };
};
