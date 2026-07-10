'use client';

import { useState } from 'react';
import { Agent, LLMProvider } from '@/lib/types';

interface SettingsModalProps {
  agents: Agent[];
  currentAgentId: string;
  onSelectAgent: (id: string) => void;
  onSave: (id: string, updates: Partial<Agent>) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function SettingsModal({
  agents,
  currentAgentId,
  onSelectAgent,
  onSave,
  onAdd,
  onDelete,
  onClose,
}: SettingsModalProps) {
  const currentAgent = agents.find((a) => a.id === currentAgentId) ?? agents[0];

  const [name, setName] = useState(currentAgent?.name ?? '');
  const [role, setRole] = useState(currentAgent?.role ?? '');
  const [instructions, setInstructions] = useState(currentAgent?.instructions ?? '');
  const [color, setColor] = useState(currentAgent?.color ?? '#3b99fc');
  const [llmProvider, setLlmProvider] = useState<LLMProvider>(
    currentAgent?.llmProvider ?? 'openai'
  );

  function selectAgent(id: string) {
    const agent = agents.find((a) => a.id === id);
    if (!agent) return;
    onSelectAgent(id);
    setName(agent.name);
    setRole(agent.role);
    setInstructions(agent.instructions);
    setColor(agent.color);
    setLlmProvider(agent.llmProvider);
  }

  function save() {
    if (!currentAgent) return;
    onSave(currentAgent.id, { name, role, instructions, color, llmProvider });
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
              <label>LLM Provider</label>
              <select
                value={llmProvider}
                onChange={(e) => setLlmProvider(e.target.value as LLMProvider)}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google</option>
              </select>
            </div>
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
              + Add Agent
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
