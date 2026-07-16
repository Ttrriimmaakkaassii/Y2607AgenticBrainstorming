import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchJsonWithRateLimitRetry } from './llm-client';

describe('fetchJsonWithRateLimitRetry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Speed up the test: stub setTimeout-backed delays to resolve immediately.
    vi.stubGlobal('setTimeout', ((fn: () => void) => fn()) as unknown as typeof setTimeout);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns the body immediately on a 200 (no retry)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ hello: 'world' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const out = await fetchJsonWithRateLimitRetry('https://x', { method: 'POST' });
    expect(out).toEqual({ hello: 'world' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 and succeeds on the second attempt', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, headers: new Headers({ 'retry-after': '0' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(), json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    const out = await fetchJsonWithRateLimitRetry('https://x', { method: 'POST' });
    expect(out).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after exhausting 429 retries, writes the rate-limit message, returns null (no throw)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429, headers: new Headers() });
    vi.stubGlobal('fetch', fetchMock);
    const sink: { message?: string } = {};
    const out = await fetchJsonWithRateLimitRetry('https://x', { method: 'POST' }, sink);
    expect(out).toBeNull();
    expect(sink.message).toMatch(/rate-limited/i);
    // 1 initial + 2 retries = 3 total attempts.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry a non-429 error (e.g. 400) — surfaces status immediately', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers(),
      text: async () => '{"error":"model_not_found"}',
    });
    vi.stubGlobal('fetch', fetchMock);
    const sink: { message?: string } = {};
    const out = await fetchJsonWithRateLimitRetry('https://x', { method: 'POST' }, sink);
    expect(out).toBeNull();
    expect(sink.message).toContain('HTTP 400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
