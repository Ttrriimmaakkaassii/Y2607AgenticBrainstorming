'use client';

import { Agent, Thread } from '@/lib/types';

interface AnalyticsModalProps {
  agents: Agent[];
  threads: Thread[];
  onClose: () => void;
}

export function AnalyticsModal({ agents, threads, onClose }: AnalyticsModalProps) {
  const allMessages = threads.flatMap((t) => t.messages);
  const agentMessages = allMessages.filter((m) => m.agentId !== 'user');
  const likes = allMessages.filter((m) => m.feedback === 'like').length;
  const dislikes = allMessages.filter((m) => m.feedback === 'dislike').length;

  const countsByAgent = new Map<string, number>();
  for (const msg of agentMessages) {
    countsByAgent.set(msg.agentId, (countsByAgent.get(msg.agentId) ?? 0) + 1);
  }
  let topAgentId: string | null = null;
  let topCount = 0;
  countsByAgent.forEach((count, agentId) => {
    if (count > topCount) {
      topCount = count;
      topAgentId = agentId;
    }
  });
  const topAgent = agents.find((a) => a.id === topAgentId);

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">📊 Conversation Analytics</span>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-section">
            <div className="modal-section-title">Statistics</div>
            <div className="stats-grid">
              <div className="stat-tile">
                <div className="stat-label">Messages</div>
                <div className="stat-value" style={{ color: '#3b99fc' }}>
                  {allMessages.length}
                </div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Threads</div>
                <div className="stat-value" style={{ color: '#2ecc71' }}>
                  {threads.length}
                </div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Likes</div>
                <div className="stat-value" style={{ color: '#34b7f1' }}>
                  {likes}
                </div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Dislikes</div>
                <div className="stat-value" style={{ color: '#ff5c5c' }}>
                  {dislikes}
                </div>
              </div>
            </div>
          </div>
          <div className="modal-section">
            <div className="modal-section-title">Top Agent</div>
            <div className="stat-tile">
              {topAgent ? (
                <>
                  <span style={{ fontWeight: 600 }}>{topAgent.name}</span> contributed the most
                  messages ({topCount})
                </>
              ) : (
                'No messages yet'
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
