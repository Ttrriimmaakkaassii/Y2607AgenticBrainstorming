'use client';

import { useState } from 'react';
import { getProvider } from '@/lib/llm-catalog';
import { Agent, LLMConnection } from '@/lib/types';

interface SettingsModalProps {
  agents: Agent[];
  currentAgentId: string;
  connections: LLMConnection[];
  onSelectAgent: (id: string) => void;
  onSave: (id: string, updates: Partial<Agent>) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onOpenLLMProviders: () => void;
  onOpenLibrary: () => void;
  onClose: () => void;
}

export function SettingsModal({
  agents,
  currentAgentId,
  connections,
  onSelectAgent,
  onSave,
  onAdd,
  onDelete,
  onOpenLLMProviders,
  onOpenLibrary,
  onClose,
}: SettingsModalProps) {
  const currentAgent = agents.find((a) => a.id === currentAgentId) ?? agents[0];

  const [name, setName] = useState(currentAgent?.name ?? '');
  const [role, setRole] = useState(currentAgent?.role ?? '');
  const [instructions, setInstructions] = useState(currentAgent?.instructions ?? '');
  const [color, setColor] = useState(currentAgent?.color ?? '#3b99fc');
  const [connectionId, setConnectionId] = useState<string | null>(
    currentAgent?.connectionId ?? null
  );

  function selectAgent(id: string) {
    const agent = agents.find((a) => a.id === id);
    if (!agent) return;
    onSelectAgent(id);
    setName(agent.name);
    setRole(agent.role);
    setInstructions(agent.instructions);
    setColor(agent.color);
    setConnectionId(agent.connectionId);
  }

  function save() {
    if (!currentAgent) return;
    const connection = connections.find((c) => c.id === connectionId);
    onSave(currentAgent.id, {
      name,
      role,
      instructions,
      color,
      connectionId,
      llmProvider: connection?.provider ?? currentAgent.llmProvider,
    });
  }

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">⚙️ Agent Settings</span>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-section">
            <div className="modal-section-title">Configure Agent</div>
            <div className="form-group">
              <label>Agent Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Role / Personality</label>
              <input value={role} onChange={(e) => setRole(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Instructions</label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Connected LLM</label>
              <select
                value={connectionId ?? ''}
                onChange={(e) => setConnectionId(e.target.value || null)}
              >
                <option value="">None (simulated responses)</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} ({getProvider(c.provider)?.name} · {c.model} · {c.effort})
                  </option>
                ))}
              </select>
            </div>
            <button
              className="btn-secondary"
              onClick={onOpenLLMProviders}
              style={{ marginBottom: 12 }}
            >
              🔌 Manage LLM Connections
            </button>
            <div className="form-group">
              <label>Avatar Color</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                style={{ width: 50, height: 30, border: '1px solid #ddd', padding: 0 }}
              />
            </div>
            <button className="btn-primary" onClick={save}>
              Save Changes
            </button>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">Available Agents</div>
            {agents.map((agent) => (
              <div
                className="agent-list-item"
                key={agent.id}
                style={{
                  cursor: 'pointer',
                  outline: agent.id === currentAgentId ? '2px solid #3b99fc' : 'none',
                }}
                onClick={() => selectAgent(agent.id)}
              >
                <div className="avatar" style={{ background: agent.color }}>
                  {agent.name.charAt(0).toUpperCase()}
                </div>
                <div className="agent-info">
                  <div className="agent-name">
                    {agent.name} ({agent.role})
                  </div>
                </div>
                <button
                  className="btn-icon delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(agent.id);
                  }}
                  disabled={agents.length <= 1}
                  title={agents.length <= 1 ? 'At least one agent is required' : 'Delete agent'}
                >
                  🗑️
                </button>
              </div>
            ))}
            <button className="btn-secondary" onClick={onAdd}>
              + Add Blank Agent
            </button>
            <button className="btn-secondary" onClick={onOpenLibrary}>
              📚 Browse Agent Library
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
