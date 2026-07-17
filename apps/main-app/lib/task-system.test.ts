import { describe, it, expect } from 'vitest';
import { createTask, assignAgent, startTask, submitDeliverable, acceptDeliverable, isComplete } from './task-system';

const baseTask = () => createTask({ conversationId: 'c1', taskType: 'research', objective: 'Find prices', requiredDeliverableType: 'research_evidence' });

describe('task lifecycle', () => {
  it('creates a queued task', () => {
    const t = baseTask();
    expect(t.status).toBe('queued');
    expect(t.taskId).toBeTruthy();
  });

  it('assigns an agent → assigned', () => {
    const t = assignAgent(baseTask(), 'a1');
    expect(t.status).toBe('assigned');
    expect(t.assignedAgentId).toBe('a1');
  });

  it('starts → running', () => {
    const t = startTask(assignAgent(baseTask(), 'a1'));
    expect(t.status).toBe('running');
  });

  it('throws on invalid transition (start a queued task without assignment)', () => {
    expect(() => startTask(baseTask())).toThrow();
  });

  it('accepts a valid research deliverable', () => {
    const t = submitDeliverable(startTask(assignAgent(baseTask(), 'a1')));
    const { task, result } = acceptDeliverable(t, 'Found 3 sources: https://example.com/specs confirm 165W single port. Retrieved 2026-07-17.');
    expect(result.accepted).toBe(true);
    expect(task.status).toBe('accepted');
    expect(isComplete(task)).toBe(true);
  });

  it('rejects a deliverable that is too short', () => {
    const t = submitDeliverable(startTask(assignAgent(baseTask(), 'a1')));
    const { result } = acceptDeliverable(t, 'ok');
    expect(result.accepted).toBe(false);
    expect(result.reasons.some((r) => r.includes('too short'))).toBe(true);
  });

  it('rejects a research deliverable without a source URL', () => {
    const t = submitDeliverable(startTask(assignAgent(baseTask(), 'a1')));
    const { result } = acceptDeliverable(t, 'I could not find specific information about this product online, but based on general knowledge...');
    expect(result.accepted).toBe(false);
  });
});
