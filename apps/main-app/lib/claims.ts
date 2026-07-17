import { ClaimRecord, ClaimStatus, CorrectionRecord } from './types';
import { generateId } from './id';

/**
 * Claim lifecycle + final-answer gate. Only verified claims (or explicitly-
 * allowed inferences with evidence) may enter recommendations and final
 * answers. Unsupported claims are stored but never promoted without passing
 * the gate.
 */

export function createClaim(input: {
  conversationId: string;
  taskId?: string;
  text: string;
  status?: ClaimStatus;
  createdByAgentId: string;
  evidenceIds?: string[];
  materiality?: ClaimRecord['materiality'];
}): ClaimRecord {
  const now = new Date().toISOString();
  return {
    claimId: generateId(),
    conversationId: input.conversationId,
    taskId: input.taskId,
    text: input.text,
    status: input.status ?? 'unverified',
    evidenceIds: input.evidenceIds ?? [],
    createdByAgentId: input.createdByAgentId,
    materiality: input.materiality ?? 'medium',
    allowedInRecommendation: false,
    allowedInFinalAnswer: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** The final-answer gate — only verified (or vetted inference) claims pass. */
export function mayUseClaimInFinalAnswer(claim: ClaimRecord): boolean {
  if (claim.status === 'verified') return true;
  if (
    claim.status === 'inference' &&
    claim.evidenceIds.length > 0 &&
    claim.allowedInFinalAnswer
  ) {
    return true;
  }
  return false;
}

export function mayUseClaimInRecommendation(claim: ClaimRecord): boolean {
  if (claim.status === 'verified') return true;
  if (claim.status === 'inference' && claim.evidenceIds.length > 0 && claim.allowedInRecommendation) {
    return true;
  }
  return false;
}

/** Promote a claim to verified (requires evidence). */
export function promoteClaim(claim: ClaimRecord): ClaimRecord {
  if (claim.evidenceIds.length === 0) {
    throw new Error('Cannot promote a claim to verified without evidence.');
  }
  return {
    ...claim,
    status: 'verified' as ClaimStatus,
    allowedInRecommendation: true,
    allowedInFinalAnswer: true,
    updatedAt: new Date().toISOString(),
  };
}

/** Reject a claim (e.g. unsupported or contradicted). */
export function rejectClaim(claim: ClaimRecord, reason?: string): ClaimRecord {
  return {
    ...claim,
    status: 'rejected' as ClaimStatus,
    allowedInRecommendation: false,
    allowedInFinalAnswer: false,
    updatedAt: new Date().toISOString(),
  };
}

/** User disputes a claim — mark disputed, remove from recommendation/final. */
export function disputeClaim(claim: ClaimRecord, reason: string): { claim: ClaimRecord; correction: CorrectionRecord } {
  const now = new Date().toISOString();
  return {
    claim: {
      ...claim,
      status: 'rejected' as ClaimStatus,
      allowedInRecommendation: false,
      allowedInFinalAnswer: false,
      updatedAt: now,
    },
    correction: {
      correctionId: generateId(),
      originalClaimId: claim.claimId,
      reason,
      createdAt: now,
    },
  };
}

/** Filter a list of claims — only those passing the final-answer gate. */
export function filterForFinalAnswer(claims: ClaimRecord[]): ClaimRecord[] {
  return claims.filter(mayUseClaimInFinalAnswer);
}
