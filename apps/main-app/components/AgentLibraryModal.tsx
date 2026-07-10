'use client';

import { useEffect, useState } from 'react';
import { AGENT_LIBRARY, AgentPreset, SkillCategory } from '@/lib/agent-library';
import { loadCustomAgents, removeCustomAgent } from '@/lib/custom-agents';

interface AgentLibraryModalProps {
  onAdd: (preset: AgentPreset) => void;
  onClose: () => void;
}

const CUSTOM_CATEGORY_ID = 'custom';

export function AgentLibraryModal({ onAdd, onClose }: AgentLibraryModalProps) {
  const [customAgents, setCustomAgents] = useState<AgentPreset[]>([]);

  useEffect(() => {
    setCustomAgents(loadCustomAgents());
  }, []);

  const categories: SkillCategory[] = [
    { id: CUSTOM_CATEGORY_ID, name: 'My Saved Agents', icon: '⭐', presets: customAgents },
    ...AGENT_LIBRARY,
  ];

  const [categoryId, setCategoryId] = useState(CUSTOM_CATEGORY_ID);
  const category = categories.find((c) => c.id === categoryId) ?? categories[0];

  function deletePreset(name: string) {
    removeCustomAgent(name);
    setCustomAgents((prev) => prev.filter((p) => p.name !== name));
  }

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <span className="modal-title">📚 Agent Library</span>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-section">
            <div className="modal-section-title">Skill Category</div>
            <div className="form-group">
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">
              {categoryId === CUSTOM_CATEGORY_ID ? 'Saved Agents' : 'Suggested Agents'}
            </div>
            {category.presets.length === 0 && (
              <div className="empty-state">
                {categoryId === CUSTOM_CATEGORY_ID
                  ? 'No saved agents yet — any agent you add or edit in a conversation is automatically saved here, and stays even after you delete it from that conversation, until you erase it below.'
                  : 'No agents in this category.'}
              </div>
            )}
            {category.presets.map((preset) => (
              <div className="agent-list-item" key={preset.name}>
                <div className="avatar" style={{ background: preset.color }}>
                  {preset.role.charAt(0).toUpperCase()}
                </div>
                <div className="agent-info">
                  <div className="agent-name">
                    {preset.name} — {preset.role}
                  </div>
                  <div className="agent-instructions">{preset.instructions}</div>
                </div>
                <button className="btn-icon" onClick={() => onAdd(preset)} title="Add to conversation">
                  ➕
                </button>
                {categoryId === CUSTOM_CATEGORY_ID && (
                  <button
                    className="btn-icon delete"
                    onClick={() => deletePreset(preset.name)}
                    title="Erase from library permanently"
                  >
                    🗑️
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
