'use client';

import { A2AMessage } from '@/lib/types';
import { formatDuration } from '@/lib/agent-timing';

/**
 * Deterministic readable rendering of a structured A2A envelope — NO extra
 * LLM call. Derived purely from envelope fields (agent / intent / phase /
 * confidence / summary / evidence / status / timing). Used in a2a_readable
 * and a2a_raw display modes.
 */
function confidenceLabel(c: A2AMessage['confidence']): string {
  switch (c) {
    case 'high': return 'High';
    case 'medium': return 'Medium';
    case 'low': return 'Low';
    case 'insufficient_evidence': return 'Insufficient evidence';
    default: return '';
  }
}

export function A2AReadableCard({ envelope, agentName }: { envelope: A2AMessage; agentName?: string }) {
  const claims = envelope.claims ?? [];
  const verified = claims.filter((c) => c.classification === 'verified').length;
  const evidenceCount = (envelope.evidenceRefs?.length ?? 0) + claims.reduce((n, c) => n + c.evidenceRefs.length, 0);
  return (
    <div className="a2a-card">
      <div className="a2a-card-meta">
        {agentName && <span className="a2a-agent">{agentName}</span>}
        <span className="a2a-chip">Intent: {envelope.intent.replace(/_/g, ' ')}</span>
        <span className="a2a-chip">Phase: {envelope.phase.replace(/_/g, ' ')}</span>
        {envelope.confidence && <span className="a2a-chip">Confidence: {confidenceLabel(envelope.confidence)}</span>}
        <span className={`a2a-status a2a-status-${envelope.status}`}>{envelope.status}</span>
      </div>
      <p className="a2a-summary">{envelope.naturalLanguageSummary}</p>
      {(envelope.decisions?.length ?? 0) > 0 && (
        <div className="a2a-section">
          <span className="a2a-section-label">Decisions:</span> {envelope.decisions!.join('; ')}
        </div>
      )}
      {(envelope.openQuestions?.length ?? 0) > 0 && (
        <div className="a2a-section">
          <span className="a2a-section-label">Open questions:</span> {envelope.openQuestions!.join('; ')}
        </div>
      )}
      <div className="a2a-card-foot">
        {claims.length > 0 && <span>{verified}/{claims.length} verified claims</span>}
        {evidenceCount > 0 && <span>{evidenceCount} evidence ref{evidenceCount === 1 ? '' : 's'}</span>}
        {envelope.durationMs != null && <span title="Total generation time">⏱ {formatDuration(envelope.durationMs)}</span>}
      </div>
    </div>
  );
}
