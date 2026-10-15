import { describe, it, expect, vi, afterEach } from 'vitest';
import { createDiscordNotifier } from './discord-notifier.service.js';

const URL_SECRET = 'https://discord.test/api/webhooks/123/SECRET-TOKEN';

describe('createDiscordNotifier', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is a no-op without a webhook URL', async () => {
    const fetchFn = vi.fn();
    await createDiscordNotifier({ webhookUrl: undefined, fetchFn }).notify('hi');
    await createDiscordNotifier({ webhookUrl: '', fetchFn }).notify('hi');
    await createDiscordNotifier({ webhookUrl: '   ', fetchFn }).notify('hi');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('posts the JSON body { content } to the webhook with a timeout signal', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    await createDiscordNotifier({ webhookUrl: URL_SECRET, fetchFn }).notify('hola');

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(URL_SECRET);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ content: 'hola' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('truncates content to 1900 characters', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    await createDiscordNotifier({ webhookUrl: URL_SECRET, fetchFn }).notify('a'.repeat(5000));
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).content).toHaveLength(1900);
  });

  it('swallows fetch errors without leaking the webhook URL', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFn = vi.fn().mockRejectedValue(new Error(`failed ${URL_SECRET}`));
    await expect(createDiscordNotifier({ webhookUrl: URL_SECRET, fetchFn }).notify('x')).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain('SECRET-TOKEN');
  });

  it('swallows timeouts (abort errors) without throwing', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFn = vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    await expect(createDiscordNotifier({ webhookUrl: URL_SECRET, fetchFn, timeoutMs: 1 }).notify('x')).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
  });

  it('logs non-2xx responses without the URL and does not throw', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    await expect(createDiscordNotifier({ webhookUrl: URL_SECRET, fetchFn }).notify('x')).resolves.toBeUndefined();
    expect(JSON.stringify(errSpy.mock.calls)).toContain('429');
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain('SECRET-TOKEN');
  });
});
