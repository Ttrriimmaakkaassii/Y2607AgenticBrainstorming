import { describe, expect, it } from 'vitest';
import { normalizeTavilyResponse, validateSearchRequest } from './search';

describe('validateSearchRequest', () => {
  it('accepts a minimal valid request and fills in defaults', () => {
    const result = validateSearchRequest({ query: 'OpenClaw architecture' });
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.query).toBe('OpenClaw architecture');
      expect(result.maxResults).toBe(6);
      expect(result.searchDepth).toBe('advanced');
      expect(result.topic).toBe('general');
    }
  });

  it('rejects a missing query', () => {
    const result = validateSearchRequest({});
    expect('error' in result).toBe(true);
  });

  it('rejects an empty/whitespace-only query', () => {
    const result = validateSearchRequest({ query: '   ' });
    expect('error' in result).toBe(true);
  });

  it('rejects a query over 500 characters', () => {
    const result = validateSearchRequest({ query: 'a'.repeat(501) });
    expect('error' in result).toBe(true);
  });

  it('rejects maxResults over 10', () => {
    const result = validateSearchRequest({ query: 'test', maxResults: 11 });
    expect('error' in result).toBe(true);
  });

  it('rejects maxResults under 1', () => {
    const result = validateSearchRequest({ query: 'test', maxResults: 0 });
    expect('error' in result).toBe(true);
  });

  it('rejects a non-integer maxResults', () => {
    const result = validateSearchRequest({ query: 'test', maxResults: 3.5 });
    expect('error' in result).toBe(true);
  });

  it('rejects an invalid searchDepth', () => {
    const result = validateSearchRequest({ query: 'test', searchDepth: 'ultra' });
    expect('error' in result).toBe(true);
  });

  it('rejects an invalid topic', () => {
    const result = validateSearchRequest({ query: 'test', topic: 'sports' });
    expect('error' in result).toBe(true);
  });

  it('rejects includeDomains over 10 items', () => {
    const result = validateSearchRequest({ query: 'test', includeDomains: Array(11).fill('example.com') });
    expect('error' in result).toBe(true);
  });

  it('rejects a malformed startDate', () => {
    const result = validateSearchRequest({ query: 'test', startDate: '01-01-2026' });
    expect('error' in result).toBe(true);
  });

  it('accepts a valid startDate/endDate', () => {
    const result = validateSearchRequest({ query: 'test', startDate: '2026-01-01', endDate: '2026-07-01' });
    expect('error' in result).toBe(false);
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
          raw_content: '# OpenClaw\n...',
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
      rawContent: '# OpenClaw\n...',
      score: 0.93,
      publishedDate: '2026-01-01',
    });
  });

  it('never forwards Tavily\'s raw response shape as-is — missing/wrong-typed fields fall back safely', () => {
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
