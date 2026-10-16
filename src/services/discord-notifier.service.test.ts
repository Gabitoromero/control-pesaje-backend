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
    expect(JSON.parse(init.body)).toEqual({ content: 'hola', allowed_mentions: { parse: [] } });
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

describe('DiscordNotifier.send', () => {
  afterEach(() => vi.restoreAllMocks());

  const ok = () => vi.fn().mockResolvedValue({ ok: true, status: 204 });

  it('returns not-configured without a webhook URL and makes no request', async () => {
    const fetchFn = vi.fn();
    const res = await createDiscordNotifier({ webhookUrl: undefined, fetchFn }).send({ content: 'x' });
    expect(res).toEqual({ ok: false, kind: 'not-configured' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('posts JSON with allowed_mentions.parse = [] when there is no attachment', async () => {
    const fetchFn = ok();
    const res = await createDiscordNotifier({ webhookUrl: URL_SECRET, fetchFn }).send({ content: 'hola' });

    expect(res).toEqual({ ok: true, status: 204 });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(URL_SECRET);
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ content: 'hola', allowed_mentions: { parse: [] } });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('truncates content to 1900 characters', async () => {
    const fetchFn = ok();
    await createDiscordNotifier({ webhookUrl: URL_SECRET, fetchFn }).send({ content: 'a'.repeat(5000) });
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).content).toHaveLength(1900);
  });

  it('posts multipart FormData with payload_json and files[0] when there is an attachment', async () => {
    const fetchFn = ok();
    const res = await createDiscordNotifier({ webhookUrl: URL_SECRET, fetchFn }).send({
      content: 'b'.repeat(5000),
      attachment: { filename: 'reporte.txt', text: 'línea 1\nlínea 2' },
    });

    expect(res).toEqual({ ok: true, status: 204 });
    const init = fetchFn.mock.calls[0][1];
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;

    const payload = JSON.parse(form.get('payload_json') as string);
    expect(payload.content).toHaveLength(1900);
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(payload.attachments).toEqual([{ id: 0, filename: 'reporte.txt' }]);

    const file = form.get('files[0]') as File;
    expect(file).toBeInstanceOf(Blob);
    expect(file.name).toBe('reporte.txt');
    expect(file.type).toContain('text/plain');
    expect(await file.text()).toBe('línea 1\nlínea 2');
  });

  it('does not set a manual Content-Type header for multipart', async () => {
    const fetchFn = ok();
    await createDiscordNotifier({ webhookUrl: URL_SECRET, fetchFn }).send({
      content: 'x',
      attachment: { filename: 'a.txt', text: 'a' },
    });
    const headers = fetchFn.mock.calls[0][1].headers ?? {};
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('content-type');
  });

  it('reports a 429 as a plain http failure (no Retry-After handling)', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 429, headers: new Headers({ 'Retry-After': '3' }) });
    const res = await createDiscordNotifier({ webhookUrl: URL_SECRET, fetchFn }).send({ content: 'x' });
    expect(res).toEqual({ ok: false, kind: 'http', status: 429 });
  });

  it('maps TimeoutError and AbortError to kind timeout', async () => {
    for (const name of ['TimeoutError', 'AbortError']) {
      const fetchFn = vi.fn().mockRejectedValue(new DOMException('timed out', name));
      const res = await createDiscordNotifier({ webhookUrl: URL_SECRET, fetchFn }).send({ content: 'x' });
      expect(res).toEqual({ ok: false, kind: 'timeout', errorName: name });
    }
  });

  it('maps other failures to kind network with only the error name', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError(`fetch failed ${URL_SECRET}`));
    const res = await createDiscordNotifier({ webhookUrl: URL_SECRET, fetchFn }).send({ content: 'x' });
    expect(res).toEqual({ ok: false, kind: 'network', errorName: 'TypeError' });
    expect(JSON.stringify(res)).not.toContain('SECRET-TOKEN');
  });

  it('handles non-Error rejections without throwing', async () => {
    const fetchFn = vi.fn().mockRejectedValue('boom');
    const res = await createDiscordNotifier({ webhookUrl: URL_SECRET, fetchFn }).send({ content: 'x' });
    expect(res).toEqual({ ok: false, kind: 'network', errorName: 'UnknownError' });
  });

  it('performs a single attempt per call (no retries)', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await createDiscordNotifier({ webhookUrl: URL_SECRET, fetchFn }).send({ content: 'x' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('never writes anything containing the webhook URL to the console', async () => {
    const spies = (['log', 'warn', 'error', 'info'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const notifier = createDiscordNotifier({
      webhookUrl: URL_SECRET,
      fetchFn: vi.fn().mockRejectedValue(new Error(`failed ${URL_SECRET}`)),
    });
    await notifier.send({ content: 'x' });
    await notifier.notify('x');
    for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain('SECRET-TOKEN');
  });
});
