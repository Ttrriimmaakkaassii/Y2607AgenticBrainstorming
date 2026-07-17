/**
 * Loop detection — tracks repeated actions (clarification questions, task
 * assignments, agent responses, state transitions) and stops the loop when a
 * threshold is exceeded. Prevents agents from asking the same question, the
 * orchestrator from re-assigning the same task, or the system from cycling
 * through the same state transitions indefinitely.
 *
 * Deterministic, in-memory (per conversation session), no LLM call.
 */

export interface LoopEntry {
  normalizedActionHash: string;
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
}

const DEFAULT_THRESHOLD = 2;

export class LoopGuard {
  private entries = new Map<string, LoopEntry>();
  private readonly threshold: number;

  constructor(threshold: number = DEFAULT_THRESHOLD) {
    this.threshold = threshold;
  }

  /** Normalize text to a hashable key (lowercase, strip punctuation/whitespace). */
  static normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
  }

  /**
   * Record an action. Returns `true` if this action has now exceeded the
   * threshold (caller should stop the loop). Idempotent within the same call.
   */
  record(actionKey: string): boolean {
    const key = LoopGuard.normalize(actionKey);
    if (!key) return false;
    const now = Date.now();
    const existing = this.entries.get(key);
    if (!existing) {
      this.entries.set(key, { normalizedActionHash: key, count: 1, firstSeenAt: now, lastSeenAt: now });
      return false;
    }
    existing.count += 1;
    existing.lastSeenAt = now;
    return existing.count > this.threshold;
  }

  /** How many times has this action been seen? */
  count(actionKey: string): number {
    return this.entries.get(LoopGuard.normalize(actionKey))?.count ?? 0;
  }

  /** Reset (e.g. on a new user message — old loops are forgiven). */
  reset(): void {
    this.entries.clear();
  }

  /** Export for observability/logging. */
  snapshot(): LoopEntry[] {
    return Array.from(this.entries.values());
  }
}
