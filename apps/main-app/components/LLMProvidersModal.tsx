'use client';

import { useState } from 'react';
import { LLM_CATALOG, getProvider } from '@/lib/llm-catalog';
import { Agent, Effort, LLMConnection, LLMProvider } from '@/lib/types';
import { generateId } from '@/lib/id';
import { renameCustomAgent } from '@/lib/custom-agents';

interface LLMProvidersModalProps {
  connections: LLMConnection[];
  onChange: (connections: LLMConnection[]) => void;
  agents: Agent[];
  onUpdateAgents: (agents: Agent[]) => void;
  onClose: () => void;
  onToast: (message: string) => void;
  /** When true, renders just the panel content (no overlay/modal chrome) for embedding in a tab. */
  embedded?: boolean;
}

function maskKey(key: string): string {
  if (key.length <= 4) return '••••';
  return `••••${key.slice(-4)}`;
}

export function LLMProvidersModal({
  connections,
  onChange,
  agents,
  onUpdateAgents,
  onClose,
  onToast,
  embedded,
}: LLMProvidersModalProps) {
  const [provider, setProvider] = useState<LLMProvider>('openai');
  const [model, setModel] = useState(LLM_CATALOG[0].models[0].id);
  const [effort, setEffort] = useState<Effort>('medium');
  const [apiKey, setApiKey] = useState('');
  const [label, setLabel] = useState('');

  const [tableAgents, setTableAgents] = useState<Agent[]>(agents);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConnectionId, setBulkConnectionId] = useState('');

  const selectedProviderInfo = getProvider(provider);
  const selectedModelInfo = selectedProviderInfo?.models.find((m) => m.id === model);

  function handleProviderChange(next: LLMProvider) {
    setProvider(next);
    const firstModel = getProvider(next)?.models[0];
    if (firstModel) setModel(firstModel.id);
  }

  function addConnection() {
    if (!apiKey.trim()) {
      onToast('Enter an API key first.');
      return;
    }
    const connection: LLMConnection = {
      id: generateId(),
      provider,
      model,
      effort,
      apiKey: apiKey.trim(),
      label: label.trim() || `${selectedProviderInfo?.name} · ${selectedModelInfo?.label}`,
    };
    onChange([...connections, connection]);
    setApiKey('');
    setLabel('');
    onToast('✅ LLM connection added');
  }

  function deleteConnection(id: string) {
    onChange(connections.filter((c) => c.id !== id));
    onToast('🗑️ LLM connection removed');
  }

  function exportConnections() {
    const blob = new Blob([JSON.stringify(connections, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'llm-connections-backup.json';
    link.click();
    URL.revokeObjectURL(url);
    onToast('📥 Downloaded connections backup — keep this file private.');
  }

  function importConnections(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as LLMConnection[];
        onChange([...connections, ...parsed]);
        onToast(`✅ Imported ${parsed.length} connection(s)`);
      } catch {
        onToast('Could not read that file — expected a connections backup JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function updateTableAgent(id: string, connectionId: string | null) {
    const connection = connections.find((c) => c.id === connectionId);
    setTableAgents((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, connectionId, llmProvider: connection?.provider ?? a.llmProvider }
          : a
      )
    );
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === tableAgents.length ? new Set() : new Set(tableAgents.map((a) => a.id))
    );
  }

  function applyBulkConnection() {
    if (!bulkConnectionId) {
      onToast('Pick an LLM to apply first.');
      return;
    }
    if (selectedIds.size === 0) {
      onToast('Select at least one agent first.');
      return;
    }
    const connection = connections.find((c) => c.id === bulkConnectionId);
    if (!connection) return;
    setTableAgents((prev) =>
      prev.map((a) =>
        selectedIds.has(a.id)
          ? { ...a, connectionId: connection.id, llmProvider: connection.provider }
          : a
      )
    );
    onToast(`Applied ${connection.label} to ${selectedIds.size} agent(s) — remember to Save.`);
  }

  function saveTable() {
    // The Alias/Name column edits an agent's actual name, not a separate
    // display-only alias — keep the Agent Library entry (and its tagged
    // categories) in sync rather than orphaning it under the old name.
    tableAgents.forEach((agent) => {
      const original = agents.find((a) => a.id === agent.id);
      if (original && original.name !== agent.name) {
        renameCustomAgent(original.name, agent.name);
      }
    });
    onUpdateAgents(tableAgents);
    onToast('✅ Agent LLM assignments saved');
  }

  const content = (
    <>
          <div className="modal-section">
            <div className="modal-section-title">Add an LLM</div>
            <div className="form-group">
              <label>Provider</label>
              <select value={provider} onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}>
                {LLM_CATALOG.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Model</label>
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {selectedProviderInfo?.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            {selectedModelInfo?.supportsEffort && (
              <div className="form-group">
                <label>Effort</label>
                <select value={effort} onChange={(e) => setEffort(e.target.value as Effort)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            )}
            <div className="form-group">
              <label>API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`${selectedProviderInfo?.name} API key`}
              />
            </div>
            <div className="form-group">
              <label>Label (optional)</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={`${selectedProviderInfo?.name} · ${selectedModelInfo?.label}`}
              />
            </div>
            <button className="btn-primary" onClick={addConnection}>
              + Add LLM
            </button>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">Connected LLMs</div>
            {connections.length === 0 && (
              <div className="empty-state">No LLMs added yet.</div>
            )}
            {connections.map((c) => (
              <div className="agent-list-item" key={c.id}>
                <div className="agent-info">
                  <div className="agent-name">{c.label}</div>
                  <div className="agent-instructions">
                    {getProvider(c.provider)?.name} · {c.model} · effort: {c.effort} · key {maskKey(c.apiKey)}
                  </div>
                </div>
                <button className="btn-icon delete" onClick={() => deleteConnection(c.id)}>
                  🗑️
                </button>
              </div>
            ))}
          </div>

          <div className="modal-section">
            <div className="modal-section-title">Assign Agents to LLMs</div>
            <div className="bulk-assign-bar">
              <select value={bulkConnectionId} onChange={(e) => setBulkConnectionId(e.target.value)}>
                <option value="">Assign selected to...</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <button className="control-btn" onClick={applyBulkConnection}>
                Apply to selected
              </button>
            </div>
            <div className="table-scroll">
              <table className="agent-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={selectedIds.size === tableAgents.length && tableAgents.length > 0}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th>Ref</th>
                    <th>Alias / Name</th>
                    <th>LLM</th>
                    <th>Model</th>
                    <th>Effort</th>
                  </tr>
                </thead>
                <tbody>
                  {tableAgents.map((agent) => {
                    const connection = connections.find((c) => c.id === agent.connectionId);
                    return (
                      <tr key={agent.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(agent.id)}
                            onChange={() => toggleSelected(agent.id)}
                          />
                        </td>
                        <td>{agent.refNumber}</td>
                        <td>
                          <input
                            type="text"
                            value={agent.name}
                            onChange={(e) =>
                              setTableAgents((prev) =>
                                prev.map((a) =>
                                  a.id === agent.id ? { ...a, name: e.target.value } : a
                                )
                              )
                            }
                          />
                        </td>
                        <td colSpan={3}>
                          <select
                            value={agent.connectionId ?? ''}
                            onChange={(e) => updateTableAgent(agent.id, e.target.value || null)}
                          >
                            <option value="">No LLM connected</option>
                            {connections.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label} ({getProvider(c.provider)?.name} · {c.model} · {c.effort})
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button className="btn-primary" onClick={saveTable} style={{ marginTop: 8 }}>
              💾 Save Changes
            </button>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">Backup / Transfer Connections</div>
            <button className="btn-secondary" onClick={exportConnections}>
              📥 Download Backup (.json)
            </button>
            <label className="btn-secondary" style={{ display: 'block', textAlign: 'center', cursor: 'pointer' }}>
              📤 Import Backup
              <input type="file" accept="application/json" onChange={importConnections} style={{ display: 'none' }} />
            </label>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">Note</div>
            <div style={{ fontSize: 12, color: '#667781' }}>
              API keys are stored only in this browser (localStorage) and sent directly from your
              browser to the provider&apos;s API when an agent uses this connection. They are never
              sent to this app&apos;s server or saved to the shared database. Don&apos;t add a
              production key on a shared or public computer. Agents with no LLM connected cannot
              respond and will appear greyed out in the conversation.
            </div>
          </div>
    </>
  );

  if (embedded) return content;

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <span className="modal-title">🔌 LLM Providers</span>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{content}</div>
      </div>
    </div>
  );
}
