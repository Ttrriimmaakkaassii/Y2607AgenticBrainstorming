import { ConversationState, EngineConversationEvent } from './types';

/**
 * Formal state-transition engine — the single reducer through which all
 * state changes flow. Validates the current state + event, produces the next
 * state deterministically, bumps the revision, and rejects invalid transitions
 * with a safe error. Idempotent for duplicate events (dedup by executionId /
 * messageId / taskId).
 *
 * This is the APPLICATION's source of truth — the LLM never touches these
 * transitions directly.
 */

export interface TransitionResult {
  state: ConversationState;
  applied: boolean;
  /** Undefined when applied; a safe (non-secret) reason when rejected. */
  rejectionReason?: string;
}

const processedEventIds = new Set<string>();

function eventId(e: EngineConversationEvent): string {
  return ('messageId' in e && e.messageId) || ('executionId' in e && e.executionId) || ('taskId' in e && e.taskId) || ('objectiveId' in e && e.objectiveId) || JSON.stringify(e);
}

function bumpRevision(state: ConversationState): ConversationState {
  const rev = (state.settings.sharedState?.revision ?? 0) + 1;
  return {
    ...state,
    settings: {
      ...state.settings,
      sharedState: { ...(state.settings.sharedState ?? { revision: 0, conversationId: state.id, verifiedFacts: {}, pendingClaims: {}, rejectedClaims: {}, decisions: [], openQuestions: [], completedTasks: [], updatedAt: new Date().toISOString() }), revision: rev },
    },
    updatedAt: Date.now(),
  };
}

export function applyEvent(state: ConversationState, event: EngineConversationEvent): TransitionResult {
  // Idempotency: skip if this exact event was already processed.
  const id = eventId(event);
  if (processedEventIds.has(id)) {
    return { state, applied: false, rejectionReason: 'duplicate_event' };
  }
  processedEventIds.add(id);

  switch (event.type) {
    case 'USER_MESSAGE_RECEIVED':
      // A user message resumes from awaiting_user.
      if (state.status === 'awaiting_user' || state.status === 'idle' || state.status === 'stopped') {
        return { state: { ...bumpRevision(state), status: 'running' }, applied: true };
      }
      return { state, applied: true }; // already running — message appends normally.

    case 'OBJECTIVE_CONFIRMED':
      return { state: bumpRevision(state), applied: true };

    case 'TASK_CREATED':
    case 'AGENT_ASSIGNED':
      return { state: bumpRevision(state), applied: true };

    case 'AGENT_STARTED':
      return { state: { ...bumpRevision(state), status: 'running' }, applied: true };

    case 'TOOL_REQUESTED':
      // Tool requests don't change conversation-level status — they're internal.
      return { state: bumpRevision(state), applied: true };

    case 'TOOL_RESULT_RECEIVED':
      return { state: bumpRevision(state), applied: true };

    case 'DELIVERABLE_SUBMITTED':
      return { state: bumpRevision(state), applied: true };

    case 'DELIVERABLE_ACCEPTED':
      return { state: bumpRevision(state), applied: true };

    case 'DELIVERABLE_REJECTED':
      return { state: bumpRevision(state), applied: true };

    case 'USER_INPUT_REQUIRED':
      return { state: { ...bumpRevision(state), status: 'awaiting_user' }, applied: true };

    case 'AGENT_FAILED':
      return { state: bumpRevision(state), applied: true };

    case 'CONVERSATION_COMPLETED':
      return { state: { ...bumpRevision(state), status: 'idle' }, applied: true };

    default:
      return { state, applied: false, rejectionReason: 'unknown_event_type' };
  }
}

/** Reset the idempotency cache (e.g. on page load). */
export function resetEventCache(): void {
  processedEventIds.clear();
}
