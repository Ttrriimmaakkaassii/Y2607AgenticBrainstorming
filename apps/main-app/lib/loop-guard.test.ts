import { describe, it, expect } from 'vitest';
import { LoopGuard } from './loop-guard';

describe('LoopGuard', () => {
  it('does not flag the first occurrence', () => {
    const g = new LoopGuard();
    expect(g.record('What is your budget?')).toBe(false);
  });

  it('flags when threshold (2) is exceeded', () => {
    const g = new LoopGuard(2);
    g.record('What is your budget?');
    g.record('What is your budget?');
    expect(g.record('What is your budget?')).toBe(true); // 3rd > 2
  });

  it('normalizes whitespace + case', () => {
    const g = new LoopGuard(1);
    g.record('What  IS your  budget?');
    expect(g.record('what is your budget?')).toBe(true); // 2nd > 1, same normalized
  });

  it('reset clears all entries', () => {
    const g = new LoopGuard(1);
    g.record('repeat');
    g.reset();
    expect(g.count('repeat')).toBe(0);
  });

  it('ignores empty input', () => {
    const g = new LoopGuard();
    expect(g.record('')).toBe(false);
    expect(g.record('   ')).toBe(false);
  });
});
