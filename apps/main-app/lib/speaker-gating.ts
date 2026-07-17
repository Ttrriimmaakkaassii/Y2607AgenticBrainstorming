import { Agent, A2APhase, SharedAgentState } from './types';

/**
 * Deterministic speaker gating — the SCHEDULER decides whether to call an
 * agent, never the agent itself (no NO_RESPONSE). A blocked agent produces no
 * provider request, no timer, no message, and no token use. This is the
 * single most load-bearing control in the runtime; it lives in code, not in
 * prompts.
 *
 * Contract (shouldInvokeAgent):
 *   - awaiting_user → never invoke (the user owns the next turn).
 *   - agent not in allowedAgentIds → never invoke.
 *   - an assignedAgentId that isn't this agent (and this agent isn't directly
 *     mentioned) → never invoke.
 *   - otherwise → invoke iff prerequisites are complete.
 *
 * Backward compatible: when there is no assignment and no explicit allowed
 * list, normal round-robin participation is allowed (otherwise we'd silence
 * every agent by default). The phase/prereq checks still apply.
 */
export interface InvokeDecision {
  invoke: boolean;
  reason?: string;
  /** Legacy field mapping for callers that still read SpeakerPermission. */
  isAssignedSpeaker: boolean;
  isDirectlyAddressed: boolean;
  isAllowedInCurrentPhase: boolean;
  upstreamRequirementsComplete: boolean;
  allowed: boolean;
}

export function shouldInvokeAgent(
  agent: Agent,
  opts: {
    status?: string;
    allowedAgentIds?: string[];
    assignedAgentId?: string;
    directMentions?: string[];
    phase?: A2APhase;
    sharedState?: SharedAgentState;
    prerequisitesComplete?: boolean;
  }
): InvokeDecision {
  const { status, allowedAgentIds, assignedAgentId, directMentions, phase, sharedState } = opts;

  // (0) The user owns the next turn.
  if (status === 'awaiting_user') {
    return { invoke: false, reason: 'awaiting_user', isAssignedSpeaker: false, isDirectlyAddressed: false, isAllowedInCurrentPhase: false, upstreamRequirementsComplete: false, allowed: false };
  }

  // Allowed-list (when one is provided, it's authoritative).
  const inAllowedList = !allowedAgentIds || allowedAgentIds.includes(agent.id);

  const isAssignedSpeaker = !!assignedAgentId && agent.id === assignedAgentId;
  const isDirectlyAddressed = !!directMentions && directMentions.includes(agent.id);

  // (1) not allowed at all.
  if (!inAllowedList) {
    return { invoke: false, reason: 'not_in_allowed_agents', isAssignedSpeaker, isDirectlyAddressed, isAllowedInCurrentPhase: true, upstreamRequirementsComplete: true, allowed: false };
  }

  // (2) an assignment exists that isn't this agent, and this agent isn't mentioned.
  if (assignedAgentId && assignedAgentId !== agent.id && !isDirectlyAddressed) {
    return { invoke: false, reason: 'not_assigned_or_addressed', isAssignedSpeaker, isDirectlyAddressed, isAllowedInCurrentPhase: true, upstreamRequirementsComplete: true, allowed: false };
  }

  // (3) phase + prerequisites.
  const isAllowedInCurrentPhase = phase !== 'error';
  const upstreamRequirementsComplete = (() => {
    if (!sharedState) return true;
    if (sharedState.activePhase === 'complete') return false;
    return true;
  })();
  const prerequisitesComplete = opts.prerequisitesComplete ?? true;

  const allowed = isAllowedInCurrentPhase && upstreamRequirementsComplete && prerequisitesComplete;
  let reason: string | undefined;
  if (!allowed) {
    if (!isAllowedInCurrentPhase) reason = `blocked_by_phase:${phase ?? '?'}`;
    else if (!upstreamRequirementsComplete) reason = 'prerequisites_incomplete';
    else reason = 'prerequisites_incomplete';
  }

  return { invoke: allowed, reason, isAssignedSpeaker, isDirectlyAddressed, isAllowedInCurrentPhase, upstreamRequirementsComplete, allowed };
}

/** Legacy alias retained for existing call sites/tests. */
export function evaluateSpeakerPermission(
  agent: Agent,
  opts: { assignedSpeaker?: string; addressedIds?: string[]; phase?: A2APhase; sharedState?: SharedAgentState }
): InvokeDecision {
  return shouldInvokeAgent(agent, {
    assignedAgentId: opts.assignedSpeaker,
    directMentions: opts.addressedIds,
    phase: opts.phase,
    sharedState: opts.sharedState,
  });
}
