import { describe, it, expect } from 'vitest';
import { startAgentTiming, completeAgentTiming, failAgentTiming, formatDuration } from './agent-timing';

describe('agent timing', () => {
  it('startAgentTiming sets an executionId + startedAt', () => {
    const t = startAgentTiming();
    expect(t.executionId).toBeTruthy();
    expect(t.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('completeAgentTiming sets completedAt, firstTokenAt (= completedAt, non-streaming), and durations', () => {
    const t0 = startAgentTiming();
    // simulate some elapsed time
    const startedMs = Date.parse(t0.startedAt);
    const done = completeAgentTiming({ ...t0, startedAt: new Date(startedMs - 1000).toISOString() });
    expect(done.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(done.firstTokenAt).toBe(done.completedAt); // non-streaming
    expect(done.totalDurationMs!).toBeGreaterThanOrEqual(1000);
    expect(done.timeToFirstTokenMs).toBe(done.totalDurationMs);
    expect(done.generationDurationMs).toBe(done.totalDurationMs);
  });

  it('failAgentTiming sets failedAt + totalDurationMs, NO completedAt', () => {
    const t0 = startAgentTiming();
    const startedMs = Date.parse(t0.startedAt);
    const failed = failAgentTiming({ ...t0, startedAt: new Date(startedMs - 500).toISOString() });
    expect(failed.failedAt).toBeDefined();
    expect(failed.completedAt).toBeUndefined();
    expect(failed.totalDurationMs!).toBeGreaterThanOrEqual(500);
  });

  it('formatDuration renders ms and seconds', () => {
    expect(formatDuration(412)).toBe('412ms');
    expect(formatDuration(1000)).toBe('1.0s');
    expect(formatDuration(8421)).toBe('8.4s');
    expect(formatDuration(undefined)).toBe('');
  });
});
