import { AgentTask, AgentTaskStatus, DeliverableResult, DeliverableType } from './types';
import { generateId } from './id';
import { validateDeliverable } from './deliverable';

/**
 * First-class task lifecycle. A task is NOT accepted because an agent said
 * "complete" — only when `acceptDeliverable` passes the validation gate.
 * Each transition validates the current status; invalid transitions are
 * rejected with a safe error (never silently corrupt state).
 */

export function createTask(input: {
  conversationId: string;
  taskType: string;
  objective: string;
  exactQuestions?: string[];
  assignedAgentId?: string;
  allowedAgentIds?: string[];
  prerequisites?: string[];
  requiredDeliverableType?: DeliverableType;
  acceptanceCriteria?: string[];
}): AgentTask {
  return {
    taskId: generateId(),
    conversationId: input.conversationId,
    taskType: input.taskType,
    objective: input.objective,
    exactQuestions: input.exactQuestions ?? [],
    assignedAgentId: input.assignedAgentId,
    allowedAgentIds: input.allowedAgentIds ?? [],
    prerequisites: input.prerequisites ?? [],
    requiredDeliverableType: input.requiredDeliverableType ?? 'general',
    acceptanceCriteria: input.acceptanceCriteria ?? [],
    status: input.assignedAgentId ? 'assigned' : 'queued',
    createdAt: new Date().toISOString(),
  };
}

export function assignAgent(task: AgentTask, agentId: string): AgentTask {
  if (task.status !== 'queued' && task.status !== 'rejected') {
    throw new Error(`Cannot assign agent to a task in status '${task.status}'.`);
  }
  return { ...task, assignedAgentId: agentId, status: 'assigned' };
}

export function startTask(task: AgentTask): AgentTask {
  if (task.status !== 'assigned') {
    throw new Error(`Cannot start a task in status '${task.status}' — must be 'assigned'.`);
  }
  return { ...task, status: 'running', startedAt: new Date().toISOString() };
}

export function submitDeliverable(task: AgentTask): AgentTask {
  if (task.status !== 'running' && task.status !== 'processing' && task.status !== 'waiting_for_tool') {
    throw new Error(`Cannot submit deliverable for a task in status '${task.status}'.`);
  }
  return { ...task, status: 'deliverable_submitted' };
}

export function acceptDeliverable(task: AgentTask, content: string): { task: AgentTask; result: DeliverableResult } {
  if (task.status !== 'deliverable_submitted') {
    return { task, result: { accepted: false, reasons: [`Task is in status '${task.status}', not 'deliverable_submitted'.`] } };
  }
  const result = validateDeliverable(task.requiredDeliverableType, content);
  if (result.accepted) {
    return {
      task: { ...task, status: 'accepted' as AgentTaskStatus, completedAt: new Date().toISOString() },
      result,
    };
  }
  return { task: { ...task, status: 'rejected' as AgentTaskStatus }, result };
}

export function rejectDeliverable(task: AgentTask, reasons: string[]): AgentTask {
  if (task.status !== 'deliverable_submitted' && task.status !== 'accepted') {
    throw new Error(`Cannot reject a task in status '${task.status}'.`);
  }
  return { ...task, status: 'rejected' };
}

export function cancelTask(task: AgentTask): AgentTask {
  if (task.status === 'accepted' || task.status === 'cancelled') return task;
  return { ...task, status: 'cancelled' };
}

export function isComplete(task: AgentTask): boolean {
  return task.status === 'accepted';
}
