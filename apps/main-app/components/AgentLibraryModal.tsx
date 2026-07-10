'use client';

import { useEffect, useState } from 'react';
import { AGENT_LIBRARY, AgentPreset, SkillCategory } from '@/lib/agent-library';
import { loadCustomAgents } from '@/lib/custom-agents';

interface AgentLibraryModalProps {
  onAdd: (preset: AgentPreset) => void;
  onClose: () => void;
}

export function AgentLibraryModal({ onAdd, onClose }: AgentLibraryModalProps) {
  const [customAgents, setCustomAgents] = useState<AgentPreset[]>([]);

  useEffect(() => {
    setCustomAgents(loadCustomAgents());
  }, []);

  const categories: SkillCategory[] =
    customAgents.length > 0
      ? [{ id: 'custom', name: 'My Saved Agents', icon: '⭐', presets: customAgents }, ...AGENT_LIBRARY]
      : AGENT_LIBRARY;

  const [categoryId, setCategoryId] = useState(categories[0].id);
  const category = categories.find((c) => c.id === categoryId) ?? categories[0];

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
              {categoryId === 'custom' ? 'Saved Agents' : 'Suggested Agents'}
            </div>
            {category.presets.length === 0 && (
              <div className="empty-state">
                No saved agents yet — agents you add or edit in a conversation are automatically
                saved here, even after you delete them from that conversation.
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
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
