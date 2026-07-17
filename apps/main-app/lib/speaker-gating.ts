import { Agent, A2APhase, SharedAgentState, SpeakerPermission } from './types';

/**
 * Speaker gating — only agents permitted by the current phase, task
 * assignment, or direct mention run. Prevents a tool result or a message
 * addressed to another agent from triggering every agent.
 *
 * NOTE on defaults: this app's round loop is round-robin over the active
 * participants. Gating here adds an opt-in layer used in A2A mode (or when an
 * assigned speaker / addressed recipients are set): when there is NO assigned
 * speaker and NO addressed recipients, the phase/task checks are relaxed so
 * normal round-robin participation still works (otherwise we'd silence every
 * agent by default). When an assignment OR explicit addressing exists, only
 * the assigned/addressed agents (phase-permitting) run.
 */
export function evaluateSpeakerPermission(
  agent: Agent,
  opts: {
    assignedSpeaker?: string;
    addressedIds?: string[];
    phase?: A2APhase;
    sharedState?: SharedAgentState;
  }
): SpeakerPermission {
  const { assignedSpeaker, addressedIds, phase, sharedState } = opts;

  const isAssignedSpeaker = !!assignedSpeaker && agent.id === assignedSpeaker;
  const isDirectlyAddressed = !!addressedIds && addressedIds.includes(agent.id);

  // error phase: nobody runs (the round reports the error instead).
  const isAllowedInCurrentPhase = phase !== 'error';

  // Upstream "complete" gate: if the shared state is in a review/complete
  // phase with a settled assigned speaker that isn't this agent, defer.
  const upstreamRequirementsComplete = (() => {
    if (!sharedState) return true;
    if (sharedState.activePhase === 'complete') return false;
    return true;
  })();

  const hasAssignment = !!assignedSpeaker || (!!addressedIds && addressedIds.length > 0);
  const allowed = isAllowedInCurrentPhase
    && upstreamRequirementsComplete
    && (!hasAssignment || isAssignedSpeaker || isDirectlyAddressed);

  let reason: string | undefined;
  if (!allowed) {
    if (!isAllowedInCurrentPhase) reason = `phase ${phase ?? '?'} does not permit speakers`;
    else if (!upstreamRequirementsComplete) reason = 'shared state is complete';
    else if (hasAssignment) reason = 'not the assigned/addressee agent';
  }

  return { isAssignedSpeaker, isDirectlyAddressed, isAllowedInCurrentPhase, upstreamRequirementsComplete, allowed, reason };
}
