import { describe, expect, it } from 'vitest';
import { normalizeTavilyResponse, validateSearchRequest } from './search';

describe('validateSearchRequest', () => {
  it('accepts a minimal valid request and fills in defaults', () => {
    const result = validateSearchRequest({ query: 'OpenClaw architecture' });
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.query).toBe('OpenClaw architecture');
      expect(result.maxResults).toBe(6);
      // Default is 'basic' — Tavily's free/dev keys reject 'advanced' with
      // HTTP 403, so the validator defaults to basic (the safe tier) unless
      // the client explicitly asks for advanced.
      expect(result.searchDepth).toBe('basic');
      expect(result.topic).toBe('general');
    }
  });

  it('rejects a missing query', () => {
    expect('error' in validateSearchRequest({})).toBe(true);
  });

  it('rejects an empty/whitespace-only query', () => {
    expect('error' in validateSearchRequest({ query: '   ' })).toBe(true);
  });

  it('rejects a query over 500 characters', () => {
    expect('error' in validateSearchRequest({ query: 'a'.repeat(501) })).toBe(true);
  });

  it('rejects maxResults over 10', () => {
    expect('error' in validateSearchRequest({ query: 'test', maxResults: 11 })).toBe(true);
  });

  it('rejects maxResults under 1', () => {
    expect('error' in validateSearchRequest({ query: 'test', maxResults: 0 })).toBe(true);
  });

  it('rejects a non-integer maxResults', () => {
    expect('error' in validateSearchRequest({ query: 'test', maxResults: 3.5 })).toBe(true);
  });

  it('rejects an invalid searchDepth', () => {
    expect('error' in validateSearchRequest({ query: 'test', searchDepth: 'ultra' })).toBe(true);
  });

  it('rejects an invalid topic', () => {
    expect('error' in validateSearchRequest({ query: 'test', topic: 'sports' })).toBe(true);
  });

  it('rejects includeDomains over 10 items', () => {
    expect('error' in validateSearchRequest({ query: 'test', includeDomains: Array(11).fill('example.com') })).toBe(true);
  });

  it('rejects a malformed startDate', () => {
    expect('error' in validateSearchRequest({ query: 'test', startDate: '01-01-2026' })).toBe(true);
  });

  it('accepts a valid startDate/endDate', () => {
    expect('error' in validateSearchRequest({ query: 'test', startDate: '2026-01-01', endDate: '2026-07-01' })).toBe(false);
  });

  it('rejects a non-object body', () => {
    expect('error' in validateSearchRequest(null)).toBe(true);
    expect('error' in validateSearchRequest('hello')).toBe(true);
  });
});

describe('normalizeTavilyResponse', () => {
  it('maps Tavily result fields into the normalized shape', () => {
    const normalized = normalizeTavilyResponse('OpenClaw', {
      results: [
        {
          title: 'OpenClaw — Official Site',
          url: 'https://openclaw.example/',
          content: 'OpenClaw is a...',
          raw_content: null,
          score: 0.93,
          published_date: '2026-01-01',
        },
      ],
    });
    expect(normalized.ok).toBe(true);
    expect(normalized.provider).toBe('tavily');
    expect(normalized.results).toHaveLength(1);
    expect(normalized.results[0]).toEqual({
      title: 'OpenClaw — Official Site',
      url: 'https://openclaw.example/',
      snippet: 'OpenClaw is a...',
      rawContent: null,
      score: 0.93,
      publishedDate: '2026-01-01',
    });
  });

  it("never forwards Tavily's raw response shape as-is — missing/wrong-typed fields fall back safely", () => {
    const normalized = normalizeTavilyResponse('test', { results: [{ url: 'https://x.example' }] });
    expect(normalized.results[0].title).toBe('');
    expect(normalized.results[0].snippet).toBe('');
    expect(normalized.results[0].rawContent).toBeNull();
    expect(normalized.results[0].score).toBeNull();
  });

  it('returns an empty results array when Tavily returns no results field', () => {
    const normalized = normalizeTavilyResponse('test', {});
    expect(normalized.results).toEqual([]);
    expect(normalized.ok).toBe(true);
  });
});
