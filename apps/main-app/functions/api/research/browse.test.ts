import { describe, expect, it } from 'vitest';
import { normalizeBrowseResponse, validateBrowseRequest } from './browse';

describe('validateBrowseRequest', () => {
  it('accepts a valid https URL', () => {
    const result = validateBrowseRequest({ url: 'https://example.com/page' });
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.url).toBe('https://example.com/page');
    }
  });

  it('accepts a valid http URL', () => {
    const result = validateBrowseRequest({ url: 'http://example.com' });
    expect('error' in result).toBe(false);
  });

  it('rejects a missing url', () => {
    expect('error' in validateBrowseRequest({})).toBe(true);
  });

  it('rejects an empty/whitespace-only url', () => {
    expect('error' in validateBrowseRequest({ url: '   ' })).toBe(true);
  });

  it('rejects a malformed url', () => {
    expect('error' in validateBrowseRequest({ url: 'not a url' })).toBe(true);
  });

  it('rejects a non-http(s) protocol', () => {
    expect('error' in validateBrowseRequest({ url: 'file:///etc/passwd' })).toBe(true);
    expect('error' in validateBrowseRequest({ url: 'javascript:alert(1)' })).toBe(true);
  });

  it('rejects a url over the max length', () => {
    const longUrl = `https://example.com/${'a'.repeat(2000)}`;
    expect('error' in validateBrowseRequest({ url: longUrl })).toBe(true);
  });

  it('rejects a non-object body', () => {
    expect('error' in validateBrowseRequest(null)).toBe(true);
    expect('error' in validateBrowseRequest('hello')).toBe(true);
  });
});

describe('normalizeBrowseResponse', () => {
  it('extracts the markdown result string', () => {
    const normalized = normalizeBrowseResponse('https://example.com', { success: true, result: '# Example\n\nSome content.' });
    expect(normalized.ok).toBe(true);
    expect(normalized.provider).toBe('cloudflare-browser-rendering');
    expect(normalized.content).toBe('# Example\n\nSome content.');
  });

  it('truncates content over the bounded length instead of forwarding it whole', () => {
    const huge = 'x'.repeat(20_000);
    const normalized = normalizeBrowseResponse('https://example.com', { result: huge });
    expect(normalized.content.length).toBeLessThan(huge.length);
    expect(normalized.content.endsWith('[...truncated]')).toBe(true);
  });

  it('returns empty content when result is missing or wrong-typed', () => {
    expect(normalizeBrowseResponse('https://example.com', {}).content).toBe('');
    expect(normalizeBrowseResponse('https://example.com', { result: 123 }).content).toBe('');
  });
});
