import { describe, it, expect } from 'vitest';
import { processUserMessage, hasConfirmedFact } from './objective';

describe('objective extraction', () => {
  it('extracts area from a user message', () => {
    const obj = processUserMessage('I want land of at least 20,000 m² to subdivide.', undefined)!;
    expect(obj.confirmedFacts.minimumArea).toMatch(/20.?000/i);
    expect(obj.confirmedFacts.assetType).toBe('land');
    expect(obj.preferences.strategy).toBe('subdivision');
  });

  it('extracts budget', () => {
    const obj = processUserMessage('My budget is 500k.', undefined)!;
    expect(obj.confirmedFacts.budget).toContain('500');
  });

  it('extracts apartment + intent', () => {
    const obj = processUserMessage('Looking for an apartment to live in near Lisbon.', undefined)!;
    expect(obj.confirmedFacts.assetType).toBe('apartment');
    expect(obj.preferences.strategy).toBe('live_in');
  });

  it('supersedes the previous objective on correction', () => {
    const obj1 = processUserMessage('I want a villa.', undefined)!;
    const obj2 = processUserMessage('Actually I want land.', obj1)!;
    expect(obj2.supersededObjectiveIds).toContain(obj1.objectiveId);
    expect(obj2.confirmedFacts.assetType).toBe('land');
  });

  it('returns the same objective when nothing new is extracted', () => {
    const obj1 = processUserMessage('I want land.', undefined)!;
    const obj2 = processUserMessage('Okay thanks.', obj1);
    expect(obj2).toBe(obj1);
  });

  it('hasConfirmedFact checks a field', () => {
    const obj = processUserMessage('Budget 300k.', undefined)!;
    expect(hasConfirmedFact(obj, 'budget')).toBe(true);
    expect(hasConfirmedFact(obj, 'assetType')).toBe(false);
  });
});
