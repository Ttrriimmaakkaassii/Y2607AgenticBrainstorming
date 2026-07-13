'use client';

import { useMemo, useState } from 'react';
import { ArchivedConversation, Agent, LLMConnection, Thread } from '@/lib/types';
import { fetchSubjectAnalysis } from '@/lib/llm-client';
import { devRef } from '@/lib/devref';
import { useOverlayClose } from '@/lib/use-overlay-close';
import { filterByPeriod, groupByAgentAndModel, sumTokens, UsagePeriod } from '@/lib/token-stats';

interface AnalyticsModalProps {
  agents: Agent[];
  threads: Thread[];
  connections: LLMConnection[];
  archives: ArchivedConversation[];
  onClose: () => void;
}

interface SubjectEntry {
  subject: string;
  category: string;
  confidence: number;
}

function parseSubjectAnalysis(raw: string): SubjectEntry[] {
  // Strip markdown code fences some models wrap JSON in despite instructions not to.
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error('Expected a JSON array');
  return parsed.map((entry: any) => ({
    subject: String(entry.subject ?? '').trim(),
    category: String(entry.category ?? 'Uncategorized').trim() || 'Uncategorized',
    confidence: Math.max(0, Math.min(100, Math.round(Number(entry.confidence) || 0))),
  }));
}

function confidenceColor(score: number): string {
  if (score >= 70) return '#2ecc71';
  if (score >= 40) return '#f39c12';
  return '#e74c3c';
}

export function AnalyticsModal({ agents, threads, connections, archives, onClose }: AnalyticsModalProps) {
  const overlayClose = useOverlayClose(onClose);
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

  const [usageConversationId, setUsageConversationId] = useState('all');
  const [usagePeriod, setUsagePeriod] = useState<UsagePeriod>('all');

  const usageMessages = useMemo(() => {
    let source: typeof allMessages;
    if (usageConversationId === 'all') {
      source = [...archives.flatMap((a) => a.state.threads.flatMap((t) => t.messages)), ...allMessages];
    } else if (usageConversationId === 'current') {
      source = allMessages;
    } else {
      const archive = archives.find((a) => a.id === usageConversationId);
      source = archive ? archive.state.threads.flatMap((t) => t.messages) : [];
    }
    return filterByPeriod(source, usagePeriod);
  }, [usageConversationId, usagePeriod, archives, allMessages]);

  const usageRows = useMemo(() => groupByAgentAndModel(usageMessages, agents), [usageMessages, agents]);
  const usageTotals = useMemo(() => sumTokens(usageMessages), [usageMessages]);

  const [subjectsExpanded, setSubjectsExpanded] = useState(false);
  const [gradingAgentId, setGradingAgentId] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<SubjectEntry[] | null>(null);
  const [checkedSubjects, setCheckedSubjects] = useState<Set<number>>(new Set());

  async function runAnalysis() {
    const agent = agents.find((a) => a.id === gradingAgentId);
    const connection = connections.find((c) => c.id === agent?.connectionId);
    if (!agent || !connection) {
      setAnalysisError('Pick an agent that has an LLM connected to grade with.');
      return;
    }
    setAnalyzing(true);
    setAnalysisError(null);
    const transcript = allMessages
      .map((m) => {
        const author = m.agentId === 'user' ? 'User' : agents.find((a) => a.id === m.agentId)?.name ?? 'Agent';
        return `${author}: ${m.content}`;
      })
      .join('\n');
    const raw = await fetchSubjectAnalysis(connection, transcript);
    setAnalyzing(false);
    if (!raw) {
      setAnalysisError(`${agent.refNumber} failed to respond — check its LLM connection.`);
      return;
    }
    try {
      setSubjects(parseSubjectAnalysis(raw));
      setCheckedSubjects(new Set());
    } catch {
      setAnalysisError('The grading agent returned something that could not be parsed as a subject list — try again.');
    }
  }

  const subjectsByCategory = new Map<string, { entry: SubjectEntry; index: number }[]>();
  (subjects ?? []).forEach((entry, index) => {
    const list = subjectsByCategory.get(entry.category) ?? [];
    list.push({ entry, index });
    subjectsByCategory.set(entry.category, list);
  });

  return (
    <div className="modal-overlay active" {...overlayClose}>
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

          <div className="modal-section" {...devRef('s25')}>
            <div className="modal-section-title">🔢 Token Usage</div>
            <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>
              Per-agent input/output token counts, snapshotted from each LLM's own response at the
              time it replied. "All conversations" combines this conversation with every 🗄️ archived
              one still kept — it's only as far back as archives haven't been deleted, not a
              guaranteed permanent ledger. Messages sent before this feature existed show no usage.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <select {...devRef('dr28')} value={usageConversationId} onChange={(e) => setUsageConversationId(e.target.value)}>
                <option value="all">All conversations</option>
                <option value="current">Current conversation</option>
                {archives.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
              <select {...devRef('dr29')} value={usagePeriod} onChange={(e) => setUsagePeriod(e.target.value as UsagePeriod)}>
                <option value="all">All-time</option>
                <option value="month">This month</option>
                <option value="week">This week</option>
              </select>
            </div>
            {usageRows.length === 0 ? (
              <div className="empty-state">No tracked token usage for this filter yet.</div>
            ) : (
              <div className="table-scroll">
                <table className="agent-table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>LLM</th>
                      <th>Input</th>
                      <th>Output</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageRows.map((row) => (
                      <tr key={`${row.agentId}-${row.provider}-${row.model}`}>
                        <td>{row.agentName}</td>
                        <td>
                          {row.provider} · {row.model}
                        </td>
                        <td>{row.totals.input.toLocaleString()}</td>
                        <td>{row.totals.output.toLocaleString()}</td>
                        <td>{row.totals.total.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 600 }}>
                      <td colSpan={2}>Total</td>
                      <td>{usageTotals.input.toLocaleString()}</td>
                      <td>{usageTotals.output.toLocaleString()}</td>
                      <td>{usageTotals.total.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <div className="modal-section" {...devRef('s21')}>
            <div
              className="modal-section-title"
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
              onClick={() => setSubjectsExpanded((v) => !v)}
              {...devRef('b53')}
            >
              <span>🧾 Subjects Discussed (latest to newest)</span>
              <span>{subjectsExpanded ? '▲' : '▼'}</span>
            </div>
            {subjectsExpanded && (
              <>
                <div className="form-group">
                  <label>Grading Agent (strict — grades how conclusive each subject's answer was)</label>
                  <select
                    {...devRef('dr17')}
                    value={gradingAgentId}
                    onChange={(e) => setGradingAgentId(e.target.value)}
                  >
                    <option value="">Choose an agent...</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.refNumber} {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  className="btn-primary"
                  {...devRef('b54')}
                  onClick={runAnalysis}
                  disabled={analyzing || !gradingAgentId}
                >
                  {analyzing ? '🔄 Analyzing…' : '🧾 Analyze Subjects'}
                </button>
                {analysisError && <div className="auth-error" style={{ marginTop: 8 }}>{analysisError}</div>}
                {subjects && subjects.length === 0 && (
                  <div className="empty-state">No subjects found yet — start a discussion first.</div>
                )}
                {Array.from(subjectsByCategory.entries()).map(([category, entries]) => (
                  <div key={category} className="trait-category-group">
                    <div className="trait-category-title">{category}</div>
                    {entries.map(({ entry, index }) => (
                      <label
                        key={index}
                        className="participants-menu-row"
                        {...devRef('r3', index)}
                      >
                        <input
                          type="checkbox"
                          {...devRef('ck11', index)}
                          checked={checkedSubjects.has(index)}
                          onChange={() =>
                            setCheckedSubjects((prev) => {
                              const next = new Set(prev);
                              if (next.has(index)) next.delete(index);
                              else next.add(index);
                              return next;
                            })
                          }
                        />
                        <span style={{ flex: 1 }}>{entry.subject}</span>
                        <span
                          title={`Confidence: ${entry.confidence}/100`}
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: confidenceColor(entry.confidence),
                          }}
                        >
                          {entry.confidence}%
                        </span>
                      </label>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
