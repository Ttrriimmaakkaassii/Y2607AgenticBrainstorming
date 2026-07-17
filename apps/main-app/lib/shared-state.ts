import {
  AgentStateDelta,
  A2APhase,
  SharedAgentState,
  VerifiedFact,
  PendingClaim,
} from './types';

/** Create an empty authoritative shared state for a conversation. */
export function emptySharedState(conversationId: string): SharedAgentState {
  return {
    revision: 0,
    conversationId,
    verifiedFacts: {},
    pendingClaims: {},
    rejectedClaims: {},
    decisions: [],
    openQuestions: [],
    completedTasks: [],
    updatedAt: new Date().toISOString(),
  };
}

/** Validate + apply a delta, returning a NEW state with a bumped revision.
 * Rejects (returns the original state unchanged) if the delta's baseRevision
 * doesn't match the current revision — a simple optimistic-concurrency guard. */
export function applyDelta(
  state: SharedAgentState,
  delta: AgentStateDelta
): { state: SharedAgentState; applied: boolean } {
  if (delta.baseRevision !== state.revision) {
    return { state, applied: false };
  }
  const next: SharedAgentState = {
    ...state,
    verifiedFacts: { ...state.verifiedFacts },
    pendingClaims: { ...state.pendingClaims },
    rejectedClaims: { ...state.rejectedClaims },
    decisions: [...state.decisions],
    openQuestions: [...state.openQuestions],
    completedTasks: [...state.completedTasks],
  };
  for (const f of delta.addFacts ?? []) {
    if (f && f.id) {
      // A fact promoted to verified drops any matching pending claim.
      next.verifiedFacts[f.id] = { ...f, updatedAt: new Date().toISOString() };
      delete next.pendingClaims[f.id];
    }
  }
  for (const c of delta.updateClaims ?? []) {
    if (c && c.id) next.pendingClaims[c.id] = { ...c, updatedAt: new Date().toISOString() };
  }
  for (const r of delta.rejectClaims ?? []) {
    if (r && r.id && next.pendingClaims[r.id]) {
      next.rejectedClaims[r.id] = {
        id: r.id,
        text: next.pendingClaims[r.id].text,
        reason: r.reason || 'rejected',
        updatedAt: new Date().toISOString(),
      };
      delete next.pendingClaims[r.id];
    }
  }
  for (const d of delta.addDecisions ?? []) if (d && !next.decisions.includes(d)) next.decisions.push(d);
  for (const q of delta.closeQuestions ?? []) {
    next.openQuestions = next.openQuestions.filter((o) => o !== q);
  }
  if (delta.setPhase) next.activePhase = delta.setPhase as A2APhase;
  if (delta.setAssignedSpeaker !== undefined) next.assignedSpeaker = delta.setAssignedSpeaker;

  next.revision = delta.nextRevision;
  next.updatedAt = new Date().toISOString();
  return { state: next, applied: true };
}

/** Build a delta that moves revision from `baseRevision` to `baseRevision+1`. */
export function makeDelta(baseRevision: number, patch: Omit<AgentStateDelta, 'baseRevision' | 'nextRevision'>): AgentStateDelta {
  return { ...patch, baseRevision, nextRevision: baseRevision + 1 };
}

/** Helpers for A2A agents to construct verified facts / pending claims. */
export function fact(id: string, text: string, evidenceRefs: string[] = []): VerifiedFact {
  return { id, text, evidenceRefs, updatedAt: new Date().toISOString() };
}
export function pending(id: string, text: string, classification: PendingClaim['classification'], evidenceRefs: string[] = []): PendingClaim {
  return { id, text, classification, evidenceRefs, updatedAt: new Date().toISOString() };
}

/** Compact, id-referenced summary of the shared state for the agent prompt (the
 * "smaller relevant state package"). Returns null when there's nothing useful
 * so the caller doesn't add an empty section. */
export function summarizeForPrompt(state: SharedAgentState | undefined): string | null {
  if (!state) return null;
  const lines: string[] = [];
  const facts = Object.values(state.verifiedFacts);
  const pendingClaims = Object.values(state.pendingClaims);
  if (facts.length === 0 && pendingClaims.length === 0 && state.decisions.length === 0 && state.openQuestions.length === 0) {
    return null;
  }
  if (state.activePhase) lines.push(`Phase: ${state.activePhase}.`);
  if (facts.length) lines.push(`Verified facts (by id): ${facts.map((f) => `${f.id}: ${f.text}`).join('; ')}`);
  if (pendingClaims.length) lines.push(`Open claims (unverified): ${pendingClaims.map((c) => `${c.id}: ${c.text}`).join('; ')}`);
  if (state.decisions.length) lines.push(`Decisions: ${state.decisions.join('; ')}`);
  if (state.openQuestions.length) lines.push(`Open questions: ${state.openQuestions.join('; ')}`);
  return lines.join('\n');
}
